import { redis } from "./redis";

// Lightweight, Redis-backed metrics. Counters are shared across web instances
// (unlike in-process counters) and expire after 45 days.
//
//   ai:ok / ai:fail               - every outbound AI-service call
//   job:<name>:ok / :fail         - background jobs
//   route:<name>:<class>          - instrumented API routes (2xx/4xx/5xx)
const TTL_SECONDS = 60 * 60 * 24 * 45;

function dayKey(d: Date = new Date()): string {
  return `metrics:${d.toISOString().slice(0, 10)}`;
}

async function incr(field: string): Promise<void> {
  try {
    const key = dayKey();
    const pipeline = redis.pipeline();
    pipeline.hincrby(key, field, 1);
    pipeline.expire(key, TTL_SECONDS);
    await pipeline.exec();
  } catch {
    // Metrics must never break the request they are measuring.
  }
}

export function recordAiCall(ok: boolean): Promise<void> {
  return incr(ok ? "ai:ok" : "ai:fail");
}

export function recordJob(name: string, ok: boolean): Promise<void> {
  return incr(`job:${name}:${ok ? "ok" : "fail"}`);
}

export function recordRoute(name: string, status: number): Promise<void> {
  return incr(`route:${name}:${Math.floor(status / 100)}xx`);
}

export type DayMetrics = { day: string; fields: Record<string, number> };

export async function metricsWindow(days: number): Promise<DayMetrics[]> {
  const out: DayMetrics[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = dayKey(d);
    let fields: Record<string, number> = {};
    try {
      const hash = await redis.hgetall(key);
      fields = Object.fromEntries(Object.entries(hash).map(([k, v]) => [k, Number(v)]));
    } catch {
      /* ignore */
    }
    out.push({ day: key.replace("metrics:", ""), fields });
  }
  return out;
}

export function sumFields(days: DayMetrics[], predicate: (field: string) => boolean): number {
  let total = 0;
  for (const d of days) {
    for (const [field, value] of Object.entries(d.fields)) {
      if (predicate(field)) total += value;
    }
  }
  return total;
}
