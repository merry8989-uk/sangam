import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis, feedKey } from "@/lib/redis";
import { moderateText, processImage, processVideo } from "@/lib/ai";
import { extractTags } from "@/lib/hashtags";

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
  media: z.array(MediaIn).max(10).default([]),
  groupId: z.string().optional()
});

const POST_INCLUDE = { author: true, media: true } as const;

// Fan-out-on-write into each follower's Redis timeline (capped at 1000).
async function fanOut(userId: string, postId: string, visibility: string) {
  if (visibility === "PRIVATE") return;
  const followers = await prisma.follow.findMany({
    where: { followeeId: userId, status: "ACCEPTED" },
    select: { followerId: true }
  });
  const score = Date.now();
  const pipeline = redis.pipeline();
  for (const f of followers) {
    pipeline.zadd(feedKey(f.followerId), score, postId);
    pipeline.zremrangebyrank(feedKey(f.followerId), 0, -1001);
  }
  await pipeline.exec();
}

// Enrich every media item on a post (thumbnails, HLS, poster, preview clip).
async function enrichMedia(postId: string) {
  const media = await prisma.media.findMany({ where: { postId } });
  await Promise.all(
    media.map(async (m) => {
      if (m.kind === "IMAGE") {
        const r = await processImage(m.storageKey);
        await prisma.media.update({
          where: { id: m.id },
          data: { width: r.width, height: r.height, thumbnailKey: r.thumbnailKey }
        });
      } else if (m.kind === "VIDEO") {
        const r = await processVideo(m.storageKey);
        await prisma.media.update({
          where: { id: m.id },
          data: {
            width: r.width,
            height: r.height,
            durationMs: r.durationMs,
            thumbnailKey: r.thumbnailKey,
            hlsKey: r.hlsKey,
            previewKey: r.previewKey
          }
        });
      }
    })
  );
}

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
    include: POST_INCLUDE
  });

  return NextResponse.json({
    items: posts,
    nextCursor: posts.length === limit ? posts[posts.length - 1].id : null
  });
}

// POST /api/posts - create, moderate, then enrich.
//
// Images are enriched inline (fast). Posts containing video are enriched in the
// background and return 202 PROCESSING; the client polls
// /api/posts/[id]/status until the post is READY or FAILED. In production this
// background step belongs on a queue worker.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { caption, type, visibility, media, groupId } = parsed.data;

  let post = await prisma.post.create({
    data: {
      authorId: userId,
      caption,
      type,
      visibility,
      groupId,
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
    include: POST_INCLUDE
  });

  // 1. Moderation. A flagged caption is held for review.
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
      // moderation unavailable: proceed (should alert in production)
    }
  }

  // 2. Index hashtags from the caption.
  if (caption) {
    try {
      for (const tag of extractTags(caption)) {
        const hashtag = await prisma.hashtag.upsert({ where: { tag }, update: {}, create: { tag } });
        await prisma.postHashtag.upsert({
          where: { postId_hashtagId: { postId: post.id, hashtagId: hashtag.id } },
          update: {},
          create: { postId: post.id, hashtagId: hashtag.id }
        });
      }
    } catch {
      /* best effort */
    }
  }

  // 3. Flagged posts are withheld from public distribution.
  if (flagged) {
    post = await prisma.post.update({
      where: { id: post.id },
      data: { visibility: "PRIVATE" },
      include: POST_INCLUDE
    });
    return NextResponse.json({ post, flagged: true }, { status: 201 });
  }

  // 4. Video posts are enriched in the background; the client polls status.
  if (media.some((m) => m.kind === "VIDEO")) {
    void (async () => {
      try {
        await enrichMedia(post.id);
        await prisma.post.update({ where: { id: post.id }, data: { status: "READY" } });
        await fanOut(userId, post.id, visibility);
      } catch {
        await prisma.post.update({ where: { id: post.id }, data: { status: "FAILED" } });
      }
    })();
    return NextResponse.json({ post, flagged: false, processing: true }, { status: 202 });
  }

  // 5. Images / text: enrich inline, then fan out.
  if (media.length) {
    try {
      await enrichMedia(post.id);
      post = await prisma.post.update({
        where: { id: post.id },
        data: { status: "READY" },
        include: POST_INCLUDE
      });
    } catch {
      await prisma.post.update({ where: { id: post.id }, data: { status: "FAILED" } });
      return NextResponse.json({ error: "Media processing failed" }, { status: 502 });
    }
  }

  await fanOut(userId, post.id, visibility);
  return NextResponse.json({ post, flagged: false }, { status: 201 });
}
