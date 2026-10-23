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

/**
 * Shown when a deployment is running transcodes in the request process.
 *
 * The in-process path is a development convenience, not a production one: a
 * restart mid-encode loses the job and leaves the post at PROCESSING until the
 * recovery sweep marks it failed. See /api/internal/recover-transcodes.
 */
export const MEDIA_QUEUE_ENABLED_HINT =
  "MEDIA_QUEUE_ENABLED is off, so transcoding runs in the request process. A restart mid-encode loses the job. Set it to true and run the worker.";

/** Has this job been put back too many times? */
export function shouldGiveUp(job: MediaJob): boolean {
  return (job.attempts ?? 0) >= MAX_JOB_ATTEMPTS;
}

export const MAX_JOB_ATTEMPTS = 3;
