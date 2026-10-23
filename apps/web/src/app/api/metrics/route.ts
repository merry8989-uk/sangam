import { NextResponse } from "next/server";
import { metricsWindow } from "@/lib/metrics";
import { computeStatuses, SLOS } from "@/lib/slo";
import { withLogging } from "@/lib/withLogging";

// GET /api/metrics - SLO status over the longest window, plus per-day counters.
// Internal: protected by the shared secret.
export const GET = withLogging("metrics:get", async (req: Request) => {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const windowDays = Math.max(...SLOS.map((s) => s.windowDays));
  const days = await metricsWindow(windowDays);
  return NextResponse.json({ slos: computeStatuses(days), days });
});
