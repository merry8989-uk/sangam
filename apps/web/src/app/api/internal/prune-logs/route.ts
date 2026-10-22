import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJob, recordRoute } from "@/lib/metrics";
import { logJob } from "@/lib/loggerServer";
import { LOG_CATEGORIES, retentionCutoff, retentionFor, type LogCategory } from "@/lib/logger";

/**
 * Applies the log retention policy. Run daily; see docs/JOBS.md.
 *
 * The standard asks for retention limits, and a log table with none grows until
 * something else breaks. Each category is kept for its own period - an audit
 * trail for a year, trace lines for three days - because they are not equally
 * valuable and not equally large.
 *
 * Retention comes from the defaults in lib/logger.ts, overridden by
 * LOG_RETENTION_JSON, which is a JSON object of category to days:
 *
 *   LOG_RETENTION_JSON={"ERROR":180,"AUDIT":730}
 *
 * A category set to 0 is kept forever, and is skipped.
 */

function retentionFromEnv(): Record<LogCategory, number> {
  const raw = (process.env.LOG_RETENTION_JSON ?? "").trim();
  if (!raw) return retentionFor();
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return retentionFor(parsed as Partial<Record<LogCategory, number>>);
  } catch {
    // A malformed override must not stop the job: the defaults are safe.
    return retentionFor();
  }
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("internal-prune-logs", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const retention = retentionFromEnv();
  const now = new Date();
  const deleted: Record<string, number> = {};
  let total = 0;

  for (const category of LOG_CATEGORIES) {
    const cutoff = retentionCutoff(category, retention[category] ?? 0, now);
    if (!cutoff) continue; // kept forever
    try {
      const res = await prisma.logEntry.deleteMany({
        where: { category, ts: { lt: cutoff } }
      });
      if (res.count) {
        deleted[category] = res.count;
        total += res.count;
      }
    } catch {
      // One category failing must not stop the others.
      deleted[category] = -1;
    }
  }

  await recordJob("prune-logs", true);
  // The job logs its own run, which is itself a JOB record.
  logJob("prune-logs", true, { deleted: total, categories: Object.keys(deleted).length });
  await recordRoute("internal-prune-logs", 200);

  return NextResponse.json({ ok: true, deleted, total, retention });
}

// A GET is allowed so a scheduler can check the policy without deleting.
export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ retention: retentionFromEnv() });
}
