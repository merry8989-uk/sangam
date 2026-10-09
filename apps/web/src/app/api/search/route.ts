import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hiddenUserIds } from "@/lib/filters";

// Search people, hashtags and posts.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ users: [], tags: [], posts: [] });

  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const hidden = viewerId ? await hiddenUserIds(viewerId) : [];

  const [users, tags, posts] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } }
        ],
        ...(hidden.length ? { id: { notIn: hidden } } : {})
      },
      take: 10,
      select: { id: true, username: true, displayName: true, avatarUrl: true }
    }),
    prisma.hashtag.findMany({
      where: { tag: { contains: q.toLowerCase() } },
      take: 10,
      select: { tag: true, _count: { select: { posts: true } } }
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

  return NextResponse.json({ users, tags, posts });
}
