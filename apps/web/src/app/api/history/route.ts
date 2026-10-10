import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import { getSettingsOptional } from "@/lib/settings";
import { resolveHistoryPolicy, type HistoryType } from "@/lib/history";

/**
 * Watch and search history.
 *
 *   GET    ?type=watch|search&archived=0|1   list, plus the policy in force
 *   DELETE ?type=watch|search|all            clear
 *
 * The rows live in Postgres, so they survive a restart of the app, the
 * container, or the machine. Cache sits in front of them for the read path; it
 * is never the store of record.
 *
 * Archived rows are kept but hidden. They come back with archived=1 and can be
 * restored one at a time through /api/history/[id].
 */
function parseType(v: string | null): HistoryType {
  return v === "search" ? "search" : "watch";
}

export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ items: [], policy: null });

  const url = new URL(req.url);
  const type = parseType(url.searchParams.get("type"));
  const archived = url.searchParams.get("archived") === "1";

  const settings = await getSettingsOptional(userId);
  const policy = resolveHistoryPolicy(settings)[type];

  if (type === "search") {
    const rows = await prisma.searchHistory.findMany({
      where: { userId, archivedAt: archived ? { not: null } : null },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return NextResponse.json({
      policy,
      items: rows.map((r) => ({ id: r.id, query: r.query, at: r.createdAt, archived: r.archivedAt !== null }))
    });
  }

  const rows = await prisma.viewHistory.findMany({
    where: { userId, archivedAt: archived ? { not: null } : null },
    orderBy: { viewedAt: "desc" },
    take: 200
  });

  // Join the posts in one query rather than per row.
  const posts = rows.length
    ? await prisma.post.findMany({
        where: { id: { in: rows.map((r) => r.postId) } },
        include: { author: { select: { username: true } }, media: true }
      })
    : [];
  const byId = new Map(posts.map((p) => [p.id, p]));

  return NextResponse.json({
    policy,
    items: rows
      .map((r) => ({
        id: r.id,
        at: r.viewedAt,
        archived: r.archivedAt !== null,
        post: byId.get(r.postId) ?? null
      }))
      // A post that has since been deleted leaves the row with nothing to show.
      .filter((r) => r.post)
  });
}

export async function DELETE(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = new URL(req.url).searchParams.get("type") ?? "all";
  if (!["watch", "search", "all"].includes(scope)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const removed: Record<string, number> = {};
  if (scope === "watch" || scope === "all") {
    removed.watch = (await prisma.viewHistory.deleteMany({ where: { userId } })).count;
  }
  if (scope === "search" || scope === "all") {
    removed.search = (await prisma.searchHistory.deleteMany({ where: { userId } })).count;
  }
  return NextResponse.json({ ok: true, removed });
}
