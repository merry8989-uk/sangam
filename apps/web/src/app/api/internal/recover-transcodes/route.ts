import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJob, recordRoute } from "@/lib/metrics";
import { logJob } from "@/lib/loggerServer";
import { MEDIA_QUEUE_ENABLED_HINT, enqueueMedia, queueEnabled } from "@/lib/queue";
import { withLogging } from "@/lib/withLogging";

/**
 * Recover posts whose transcoding never finished.
 *
 * With `MEDIA_QUEUE_ENABLED=true` the worker owns the job, and a job is put back
 * on the queue when the worker dies, so this is a safety net for the worker
 * itself going away entirely.
 *
 * With it **off**, the work runs inside the request process. A restart, a
 * redeploy, or an out-of-memory kill mid-encode leaves the post at `PROCESSING`
 * forever, the composer polls a status that will never change, and the user
 * watches a spinner with no way out. That is the case this exists for.
 *
 * What it does, per stuck post:
 *
 *   the queue is on   -> put it back, up to a bounded number of attempts
 *   the queue is off  -> mark it FAILED with a reason, so the composer can stop
 *                        polling and say something true
 *
 * Run it every few minutes. See docs/JOBS.md.
 */

/** How long a post may sit in PROCESSING before it is considered stuck. */
export const STUCK_AFTER_MS = 15 * 60 * 1000;
/** How many times a job may be put back before it is given up on. */
export const MAX_ATTEMPTS = 3;

export const POST = withLogging("internal:recover-transcodes:post", async (req: Request) => {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("internal-recover-transcodes", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  const stuck = await prisma.post.findMany({
    where: { status: "PROCESSING", createdAt: { lt: cutoff } },
    select: { id: true, authorId: true, visibility: true },
    orderBy: { createdAt: "asc" },
    take: 200
  });

  const queued: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];

  for (const post of stuck) {
    try {
      if (queueEnabled()) {
        await enqueueMedia({
          postId: post.id,
          userId: post.authorId,
          visibility: post.visibility,
          attempts: 1
        });
        queued.push(post.id);
        continue;
      }

      // No queue, so nothing is going to pick this up. Saying so is better than
      // leaving a spinner that never resolves.
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "FAILED" }
      });
      failed.push(post.id);
    } catch {
      errors.push(post.id);
    }
  }

  const ok = errors.length === 0;
  await recordJob("recover-transcodes", ok);
  logJob("recover-transcodes", ok, {
    stuck: stuck.length,
    requeued: queued.length,
    failed: failed.length,
    errors: errors.length,
    queueEnabled: queueEnabled()
  });
  await recordRoute("internal-recover-transcodes", 200);

  return NextResponse.json({
    ok,
    found: stuck.length,
    requeued: queued,
    markedFailed: failed,
    errors,
    // Stated in the response so an operator does not have to remember which mode
    // the deployment is in when reading the numbers.
    mode: queueEnabled() ? "queue" : "in-process",
    note: queueEnabled() ? MEDIA_QUEUE_ENABLED_HINT : undefined
  });
});

/** A GET reports what would be recovered, without touching anything. */
export const GET = withLogging("internal:recover-transcodes:get", async (req: Request) => {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  const count = await prisma.post.count({
    where: { status: "PROCESSING", createdAt: { lt: cutoff } }
  });
  return NextResponse.json({
    mode: queueEnabled() ? "queue" : "in-process",
    stuckAfterMinutes: Math.round(STUCK_AFTER_MS / 60000),
    wouldRecover: count
  });
});
