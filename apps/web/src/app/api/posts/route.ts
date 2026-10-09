import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis, feedKey } from "@/lib/redis";
import { processImage } from "@/lib/ai";

const MediaIn = z.object({
  key: z.string().min(1),
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO"]),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().nonnegative()
});

const CreateBody = z.object({
  caption: z.string().max(2200).optional(),
  type: z.enum(["IMAGE", "VIDEO", "SHORT", "TEXT"]).default("TEXT"),
  visibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).default("PUBLIC"),
  media: z.array(MediaIn).max(10).default([])
});

// GET /api/posts?cursor=<id>&limit=20 - cursor-paginated public feed.
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

// POST /api/posts - create a post, process images, then fan out to followers.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { caption, type, visibility, media } = parsed.data;

  let post = await prisma.post.create({
    data: {
      authorId: userId,
      caption,
      type,
      visibility,
      status: media.length ? "PROCESSING" : "READY",
      media: {
        create: media.map((m) => ({
          ownerId: userId,
          kind: m.kind,
          storageKey: m.key,
          mimeType: m.mimeType,
          sizeBytes: m.sizeBytes
        }))
      }
    },
    include: { author: true, media: true }
  });

  // Media enrichment. Production moves this onto a queue (the post stays
  // PROCESSING and a worker flips it to READY); the starter does it inline
  // so the vertical slice is observable end-to-end.
  const images = post.media.filter((m) => m.kind === "IMAGE");
  if (images.length) {
    try {
      await Promise.all(
        images.map(async (m) => {
          const r = await processImage(m.storageKey);
          await prisma.media.update({
            where: { id: m.id },
            data: { width: r.width, height: r.height, thumbnailKey: r.thumbnailKey }
          });
        })
      );
      post = await prisma.post.update({
        where: { id: post.id },
        data: { status: "READY" },
        include: { author: true, media: true }
      });
    } catch {
      await prisma.post.update({ where: { id: post.id }, data: { status: "FAILED" } });
      return NextResponse.json({ error: "Media processing failed" }, { status: 502 });
    }
  }

  // Fan-out-on-write into each follower's Redis timeline (capped at 1000).
  if (visibility !== "PRIVATE") {
    const followers = await prisma.follow.findMany({
      where: { followeeId: userId, status: "ACCEPTED" },
      select: { followerId: true }
    });
    const score = Date.now();
    const pipeline = redis.pipeline();
    for (const f of followers) {
      pipeline.zadd(feedKey(f.followerId), score, post.id);
      pipeline.zremrangebyrank(feedKey(f.followerId), 0, -1001);
    }
    await pipeline.exec();
  }

  return NextResponse.json(post, { status: 201 });
}
