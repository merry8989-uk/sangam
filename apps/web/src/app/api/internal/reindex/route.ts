import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureIndexes, indexPosts, indexUsers } from "@/lib/search";

// Backfill the search indexes. Run once after enabling Meilisearch, or any
// time the index needs rebuilding (see docs/JOBS.md).
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureIndexes();

  const posts = await prisma.post.findMany({
    where: { visibility: "PUBLIC", status: "READY" },
    include: { author: { select: { username: true } }, hashtags: { include: { hashtag: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000
  });
  await indexPosts(
    posts.map((p) => ({
      id: p.id,
      caption: p.caption ?? "",
      authorUsername: p.author.username,
      hashtags: p.hashtags.map((h) => h.hashtag.tag),
      type: p.type,
      createdAt: p.createdAt.getTime()
    }))
  );

  const users = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true },
    take: 5000
  });
  await indexUsers(users);

  return NextResponse.json({ posts: posts.length, users: users.length });
}
