import { prisma } from "./prisma";
import { redis, feedKey } from "./redis";
import { processImage, processVideo } from "./ai";
import { getSettingsOptional } from "./settings";
import { uploadCapHeight, uploadAudioBitrate } from "./quality";
import { POST_INCLUDE_PUBLIC } from "./select";

/**
 * The include shape for a post in a list.
 *
 * `author: true` used to be here, and it selected every column of the User row -
 * including the bcrypt hash, the email address and the phone number. The public
 * feed returned that object verbatim, so anyone could read them. Selecting an
 * explicit set means a new column on User cannot leak by being forgotten.
 */
export const POST_INCLUDE = POST_INCLUDE_PUBLIC;

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

  // The author's upload quality decides how high the transcoder may go.
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  const authorSettings = await getSettingsOptional(post?.authorId);
  const maxHeight = uploadCapHeight(authorSettings?.uploadQuality);
  const audioBitrate = uploadAudioBitrate(authorSettings?.uploadQuality);
  await Promise.all(
    media.map(async (m) => {
      if (m.kind === "IMAGE") {
        const r = await processImage(m.storageKey);
        await prisma.media.update({
          where: { id: m.id },
          data: { width: r.width, height: r.height, thumbnailKey: r.thumbnailKey }
        });
      } else if (m.kind === "VIDEO") {
        const r = await processVideo(m.storageKey, { maxHeight, audioBitrate });
        await prisma.media.update({
          where: { id: m.id },
          data: {
            width: r.width,
            height: r.height,
            durationMs: r.durationMs,
            thumbnailKey: r.thumbnailKey,
            hlsKey: r.hlsKey,
            previewKey: r.previewKey,
            renditions: (r.variants ?? []) as unknown as object[]
          }
        });
      }
    })
  );
}
