import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJob, recordRoute } from "@/lib/metrics";
import { cutoffFor, resolveHistoryPolicy, shouldPrune } from "@/lib/history";

/**
 * Applies each user's history policy. Run daily; see docs/JOBS.md.
 *
 * Both history types are handled, and the policy decides the outcome:
 *   auto     - rows older than the period are deleted
 *   archive  - rows older than the period are moved to the archive
 *   keep/off - left exactly as they are
 *
 * "off" is deliberately not a deletion. It stops new rows being written; it
 * does not quietly remove what the user already has.
 *
 * Rows are already in Postgres, so nothing here is lost to a cache restart -
 * this job is the only thing that removes them.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("prune-history", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Only users who have a period set on at least one type are worth loading.
    const users = await prisma.userSettings.findMany({
      where: {
        OR: [
          { watchHistoryMode: { in: ["auto", "archive"] } },
          { searchHistoryMode: { in: ["auto", "archive"] } },
          // Rows written before the per-type policy existed.
          { autoDeleteDays: { gt: 0 } }
        ]
      },
      select: {
        userId: true,
        watchHistoryMode: true,
        watchHistoryDays: true,
        searchHistoryMode: true,
        searchHistoryDays: true,
        historyEnabled: true,
        autoDeleteDays: true
      }
    });

    let removedWatch = 0, removedSearch = 0, archivedWatch = 0, archivedSearch = 0;
    const now = new Date();

    for (const u of users) {
      const policy = resolveHistoryPolicy(u);

      if (shouldPrune(policy.watch)) {
        const cutoff = cutoffFor(policy.watch, now);
        if (cutoff) {
          if (policy.watch.mode === "auto") {
            removedWatch += (
              await prisma.viewHistory.deleteMany({
                where: { userId: u.userId, viewedAt: { lt: cutoff } }
              })
            ).count;
          } else {
            archivedWatch += (
              await prisma.viewHistory.updateMany({
                // archivedAt: null keeps the job idempotent - a second run does
                // not move the same rows again or reset their archive date.
                where: { userId: u.userId, viewedAt: { lt: cutoff }, archivedAt: null },
                data: { archivedAt: now }
              })
            ).count;
          }
        }
      }

      if (shouldPrune(policy.search)) {
        const cutoff = cutoffFor(policy.search, now);
        if (cutoff) {
          if (policy.search.mode === "auto") {
            removedSearch += (
              await prisma.searchHistory.deleteMany({
                where: { userId: u.userId, createdAt: { lt: cutoff } }
              })
            ).count;
          } else {
            archivedSearch += (
              await prisma.searchHistory.updateMany({
                where: { userId: u.userId, createdAt: { lt: cutoff }, archivedAt: null },
                data: { archivedAt: now }
              })
            ).count;
          }
        }
      }
    }

    await recordJob("prune-history", true);
    await recordRoute("prune-history", 200);
    return NextResponse.json({
      users: users.length,
      removed: { watch: removedWatch, search: removedSearch },
      archived: { watch: archivedWatch, search: archivedSearch }
    });
  } catch {
    await recordJob("prune-history", false);
    await recordRoute("prune-history", 500);
    return NextResponse.json({ error: "Prune failed" }, { status: 500 });
  }
}
