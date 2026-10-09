import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hiddenUserIds } from "@/lib/filters";
import { searchEnabled, searchPosts as meiliPosts, searchUsers as meiliUsers } from "@/lib/search";
import { recordRoute } from "@/lib/metrics";

const EMPTY = { users: [], tags: [], posts: [] };

// Search people, hashtags and posts. Posts and people use Meilisearch when it
// is configured; otherwise both fall back to Postgres `contains`. Hashtags
// always come from Postgres (they are just counts).
export async function GET(req: Request) {
  const res = await handleSearch(req);
  await recordRoute("search", res.status);
  return res;
}

async function handleSearch(req: Request): Promise<Response> {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json(EMPTY);

  const viewerId = await getViewerId(req);
  const hidden = viewerId ? await hiddenUserIds(viewerId) : [];
  const hideFilter = hidden.length ? { id: { notIn: hidden } } : {};

  const tags = await prisma.hashtag.findMany({
    where: { tag: { contains: q.toLowerCase() } },
    take: 10,
    select: { tag: true, _count: { select: { posts: true } } }
  });

  if (searchEnabled()) {
    const [postIds, userIds] = await Promise.all([meiliPosts(q, 20), meiliUsers(q, 10)]);

    const [posts, users] = await Promise.all([
      postIds.length
        ? prisma.post.findMany({
            where: {
              id: { in: postIds },
              visibility: "PUBLIC",
              status: "READY",
              ...(hidden.length ? { authorId: { notIn: hidden } } : {})
            },
            include: { author: { select: { username: true } }, media: true }
          })
        : [],
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds }, ...hideFilter },
            select: { id: true, username: true, displayName: true, avatarUrl: true }
          })
        : []
    ]);

    // preserve Meilisearch relevance order
    const postOrder = new Map(postIds.map((id, i) => [id, i]));
    posts.sort((a, b) => (postOrder.get(a.id) ?? 0) - (postOrder.get(b.id) ?? 0));

    return NextResponse.json({ users, tags, posts, engine: "meilisearch" });
  }

  const [users, posts] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } }
        ],
        ...hideFilter
      },
      take: 10,
      select: { id: true, username: true, displayName: true, avatarUrl: true }
    }),
    prisma.post.findMany({
      where: {
        caption: { contains: q, mode: "insensitive" },
        visibility: "PUBLIC",
        status: "READY",
        ...(hidden.length ? { authorId: { notIn: hidden } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { author: { select: { username: true } }, media: true }
    })
  ]);

  return NextResponse.json({ users, tags, posts, engine: "postgres" });
}
