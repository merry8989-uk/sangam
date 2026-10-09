import { redis } from "./redis";

// Redis-backed media job queue. The worker (apps/worker) pops from here and
// calls the enrich endpoint. A job moved to the processing list is re-queued
// on failure, so a crash mid-job does not lose work.
export const MEDIA_QUEUE = "queue:media";
export const MEDIA_PROCESSING = "queue:media:processing";

export type MediaJob = {
  postId: string;
  userId: string;
  visibility: string;
  attempts?: number;
  traceparent?: string;
};

export function queueEnabled(): boolean {
  return process.env.MEDIA_QUEUE_ENABLED === "true";
}

export async function enqueueMedia(job: MediaJob): Promise<void> {
  await redis.lpush(MEDIA_QUEUE, JSON.stringify(job));
}
