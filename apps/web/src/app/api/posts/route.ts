import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateText } from "@/lib/ai";
import { extractTags } from "@/lib/hashtags";
import { POST_INCLUDE, enrichMedia, fanOut } from "@/lib/media-pipeline";
import { enqueueMedia, queueEnabled } from "@/lib/queue";
import { newTraceparent } from "@/lib/trace";
import { indexPosts } from "@/lib/search";
import { recordRoute } from "@/lib/metrics";

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
// Images are enriched inline (fast). Posts with video are handed to the media
// queue (MEDIA_QUEUE_ENABLED=true) or, if the queue is off, to an in-process
// background task; either way the client polls /api/posts/[id]/status.
export async function POST(req: Request) {
  const res = await handleCreatePost(req);
  await recordRoute("posts:create", res.status);
  return res;
}

async function handleCreatePost(req: Request): Promise<Response> {
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
      /* moderation unavailable: proceed */
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

  // 2b. Index for search (best effort; no-op when Meilisearch is unset).
  try {
    await indexPosts([
      {
        id: post.id,
        caption: caption ?? "",
        authorUsername: post.author.username,
        hashtags: extractTags(caption),
        type,
        createdAt: post.createdAt.getTime()
      }
    ]);
  } catch {
    /* search index is optional */
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

  // 4. Video: hand off to the queue (durable) or a background task (fallback).
  if (media.some((m) => m.kind === "VIDEO")) {
    let queued = false;
    if (queueEnabled()) {
      try {
        await enqueueMedia({ postId: post.id, userId, visibility, traceparent: newTraceparent() });
        queued = true;
      } catch {
        /* fall back to the background task */
      }
    }
    if (!queued) {
      void (async () => {
        try {
          await enrichMedia(post.id);
          await prisma.post.update({ where: { id: post.id }, data: { status: "READY" } });
          await fanOut(userId, post.id, visibility);
        } catch {
          await prisma.post.update({ where: { id: post.id }, data: { status: "FAILED" } });
        }
      })();
    }
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
