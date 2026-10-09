import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJob, recordRoute } from "@/lib/metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

// Deletes view-history rows older than each user's auto-delete window
// (Settings → History → auto-delete after N days). Run daily; see docs/JOBS.md.
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("prune-history", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await prisma.userSettings.findMany({
      where: { autoDeleteDays: { gt: 0 } },
      select: { userId: true, autoDeleteDays: true }
    });

    let removed = 0;
    for (const u of users) {
      const cutoff = new Date(Date.now() - u.autoDeleteDays * DAY_MS);
      const res = await prisma.viewHistory.deleteMany({
        where: { userId: u.userId, viewedAt: { lt: cutoff } }
      });
      removed += res.count;
    }

    await recordJob("prune-history", true);
    await recordRoute("prune-history", 200);
    return NextResponse.json({ users: users.length, removed });
  } catch {
    await recordJob("prune-history", false);
    await recordRoute("prune-history", 500);
    return NextResponse.json({ error: "Prune failed" }, { status: 500 });
  }
}
