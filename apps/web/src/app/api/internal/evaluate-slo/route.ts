import { NextResponse } from "next/server";
import { metricsWindow } from "@/lib/metrics";
import { computeStatuses, SLOS } from "@/lib/slo";
import { raiseAlert } from "@/lib/alert";
import { recordJob, recordRoute } from "@/lib/metrics";

// Evaluates the error budgets and raises alerts on breach. Run every few
// minutes from a scheduler (see docs/JOBS.md).
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("evaluate-slo", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const windowDays = Math.max(...SLOS.map((s) => s.windowDays));
    const days = await metricsWindow(windowDays);
    const statuses = computeStatuses(days);

    const raised: string[] = [];
    for (const s of statuses) {
      if (!s.breaching) continue;
      // epsilon: at exactly 100% consumed, float rounding leaves remainingPct
      // a hair above zero, which would otherwise downgrade this to a warning
      const severity = s.remainingPct < 1e-6 ? "critical" : "warning";
      const message =
        s.remainingPct <= 0
          ? `error budget exhausted (availability ${(s.availability * 100).toFixed(2)}% vs ${(s.target * 100).toFixed(1)}% target)`
          : `burning error budget fast (burn rate ${s.burnRate.toFixed(2)}x, ${(s.remainingPct * 100).toFixed(0)}% left)`;
      const alert = await raiseAlert(s.key, severity, message, s.burnRate);
      if (alert) raised.push(`${s.key}:${severity}`);
    }

    await recordJob("evaluate-slo", true);
    await recordRoute("evaluate-slo", 200);
    return NextResponse.json({ evaluated: statuses.length, raised });
  } catch {
    await recordJob("evaluate-slo", false);
    await recordRoute("evaluate-slo", 500);
    return NextResponse.json({ error: "Evaluation failed" }, { status: 500 });
  }
}
