import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis, feedKey } from "@/lib/redis";
import { moderateText, processImage, processVideo } from "@/lib/ai";

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

// GET /api/posts?cursor=<id>&limit=20&type=<TYPE> - cursor-paginated feed.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const cursor = url.searchParams.get("cursor");
  const type = url.searchParams.get("type");

  const posts = await prisma.post.findMany({
    where: {
      visibility: "PUBLIC",
      status: "READY",
      ...(type ? { type: type as "IMAGE" | "VIDEO" | "SHORT" | "TEXT" } : {})
    },
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

// POST /api/posts - create, moderate, enrich media, then fan out to followers.
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

  // 1. Moderation. A flagged caption is held for review: the post is hidden
  //    (PRIVATE) and a flag is recorded rather than published. Fail-open on
  //    service error, which is logged by the caller in production.
  let flagged = false;
  if (caption) {
    try {
      const m = await moderateText(caption);
      if (m.flagged) {
        flagged = true;
        await prisma.moderationFlag.create({
          data: {
            entityType: "post",
            entityId: post.id,
            reason: m.categories.join(",") || "text",
            score: m.score,
            source: "ai"
          }
        });
      }
    } catch {
      // moderation unavailable: proceed, but this should alert in production
    }
  }

  // 2. Media enrichment (queue in production; inline here for a working slice).
  const images = post.media.filter((m) => m.kind === "IMAGE");
  const videos = post.media.filter((m) => m.kind === "VIDEO");
  if (images.length || videos.length) {
    try {
      await Promise.all([
        ...images.map(async (m) => {
          const r = await processImage(m.storageKey);
          await prisma.media.update({
            where: { id: m.id },
            data: { width: r.width, height: r.height, thumbnailKey: r.thumbnailKey }
          });
        }),
        ...videos.map(async (m) => {
          const r = await processVideo(m.storageKey);
          await prisma.media.update({
            where: { id: m.id },
            data: {
              width: r.width,
              height: r.height,
              durationMs: r.durationMs,
              thumbnailKey: r.thumbnailKey,
              hlsKey: r.hlsKey
            }
          });
        })
      ]);
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

  // 3. Flagged posts are withheld from public distribution.
  if (flagged) {
    post = await prisma.post.update({
      where: { id: post.id },
      data: { visibility: "PRIVATE" },
      include: { author: true, media: true }
    });
    return NextResponse.json({ post, flagged: true }, { status: 201 });
  }

  // 4. Fan-out-on-write into each follower's Redis timeline (capped at 1000).
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

  return NextResponse.json({ post, flagged: false }, { status: 201 });
}
