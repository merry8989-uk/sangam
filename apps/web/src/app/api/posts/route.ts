import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis, feedKey } from "@/lib/redis";

const CreateBody = z.object({
  caption: z.string().max(2200).optional(),
  type: z.enum(["IMAGE", "VIDEO", "SHORT", "TEXT"]).default("TEXT"),
  visibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).default("PUBLIC"),
  mediaKeys: z.array(z.string()).max(10).default([])
});

// GET /api/posts?cursor=<iso>&limit=20 - cursor-paginated public feed.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const cursor = url.searchParams.get("cursor");

  const posts = await prisma.post.findMany({
    where: { visibility: "PUBLIC", status: "READY" },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { author: true, media: true }
  });

  return NextResponse.json({
    items: posts,
    nextCursor: posts.length === limit ? posts[posts.length - 1].id : null
  });
}

// POST /api/posts - create a post, then fan out its id to followers' feed caches.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { caption, type, visibility, mediaKeys } = parsed.data;

  const post = await prisma.post.create({
    data: {
      authorId: userId,
      caption,
      type,
      visibility,
      status: mediaKeys.length ? "PROCESSING" : "READY",
      media: {
        create: mediaKeys.map((key) => ({
          ownerId: userId,
          kind: "IMAGE" as const,
          storageKey: key,
          mimeType: "application/octet-stream",
          sizeBytes: 0
        }))
      }
    },
    include: { author: true, media: true }
  });

  // Fan-out-on-write: push into each follower's Redis timeline.
  // (A background worker is the production-grade version of this.)
  if (visibility !== "PRIVATE") {
    const followers = await prisma.follow.findMany({
      where: { followeeId: userId, status: "ACCEPTED" },
      select: { followerId: true }
    });
    const score = Date.now();
    const pipeline = redis.pipeline();
    for (const f of followers) {
      pipeline.zadd(feedKey(f.followerId), score, post.id);
      pipeline.zremrangebyrank(feedKey(f.followerId), 0, -1001); // cap at 1000
    }
    await pipeline.exec();
  }

  return NextResponse.json(post, { status: 201 });
}
