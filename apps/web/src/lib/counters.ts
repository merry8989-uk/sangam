import { redis } from "./redis";
import { prisma } from "./prisma";

// High-volume counters (views) are buffered in Redis and flushed to Postgres
// in batches, instead of writing to the database on every page view.
const DIRTY = "counters:dirty";
const LOCK = "counters:flush:lock";
const key = (postId: string) => `counters:post:${postId}`;

export async function bumpView(postId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.hincrby(key(postId), "view", 1);
  pipeline.sadd(DIRTY, postId);
  await pipeline.exec();
}

// Pending (not-yet-flushed) views for a post, so the UI can show a live total.
export async function pendingViews(postId: string): Promise<number> {
  const v = await redis.hget(key(postId), "view");
  return v ? Number(v) : 0;
}

// Apply buffered increments to the database. Safe to run concurrently: a
// short Redis lock ensures only one flush happens at a time.
export async function flushCounters(): Promise<{ posts: number; views: number }> {
  const acquired = await redis.set(LOCK, "1", "EX", 30, "NX");
  if (!acquired) return { posts: 0, views: 0 };

  try {
    const ids = await redis.smembers(DIRTY);
    let views = 0;
    for (const id of ids) {
      const v = Number((await redis.hget(key(id), "view")) ?? 0);
      if (v > 0) {
        try {
          await prisma.post.update({ where: { id }, data: { viewCount: { increment: v } } });
          views += v;
        } catch {
          // post may have been deleted; drop the increment
        }
      }
      await redis.del(key(id));
      await redis.srem(DIRTY, id);
    }
    return { posts: ids.length, views };
  } finally {
    await redis.del(LOCK);
  }
}
