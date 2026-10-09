// Media enrichment worker.
//
// Pops jobs from the Redis queue, calls the web app's internal enrich
// endpoint (which owns the database and storage work), and re-queues on
// failure. Jobs live in a processing list while in flight, so a crash does
// not silently drop them.
import { randomBytes } from "crypto";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const WEB_URL = process.env.WEB_URL || "http://localhost:3000";
const SECRET = process.env.INTERNAL_SECRET || "";
const QUEUE = "queue:media";
const PROCESSING = "queue:media:processing";
const MAX_ATTEMPTS = 3;

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

function traceparent(job) {
  if (job.traceparent) return job.traceparent;
  return `00-${randomBytes(16).toString("hex")}-${randomBytes(8).toString("hex")}-01`;
}

async function enrich(job) {
  const res = await fetch(`${WEB_URL}/api/internal/enrich`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": SECRET,
      traceparent: traceparent(job)
    },
    body: JSON.stringify(job)
  });
  if (!res.ok) throw new Error(`enrich returned ${res.status}`);
}

async function main() {
  console.log("[worker] media queue worker started");
  for (;;) {
    const raw = await redis.brpoplpush(QUEUE, PROCESSING, 0);
    if (!raw) continue;
    let job;
    try {
      job = JSON.parse(raw);
    } catch {
      await redis.lrem(PROCESSING, 1, raw);
      continue;
    }
    try {
      await enrich(job);
      await redis.lrem(PROCESSING, 1, raw);
    } catch (err) {
      const attempts = (job.attempts ?? 0) + 1;
      await redis.lrem(PROCESSING, 1, raw);
      if (attempts < MAX_ATTEMPTS) {
        await redis.lpush(QUEUE, JSON.stringify({ ...job, attempts }));
        console.warn(`[worker] retry ${attempts} for post ${job.postId}`);
      } else {
        console.error(`[worker] giving up on post ${job.postId}: ${err}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
