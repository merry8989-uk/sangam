import { prisma } from "./prisma";
import { redis, feedKey } from "./redis";
import { processImage, processVideo } from "./ai";

export const POST_INCLUDE = { author: true, media: true } as const;

// Fan-out-on-write into each follower's Redis timeline (capped at 1000).
export async function fanOut(userId: string, postId: string, visibility: string) {
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
export async function enrichMedia(postId: string) {
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
