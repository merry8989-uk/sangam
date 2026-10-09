import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
    lazyConnect: false
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Feed cache keys live here. Fan-out-on-write pushes post IDs into
// feed:{userId} sorted sets (score = timestamp), mirroring the classic
// hybrid push/pull timeline model.
export const feedKey = (userId: string) => `feed:${userId}`;
