import { prisma } from "@/lib/prisma";
import { metricsWindow } from "@/lib/metrics";
import { computeStatuses, SLOS } from "@/lib/slo";

export const dynamic = "force-dynamic";

// Operations view: error budgets and recent alerts. Admin-only in production.
export default async function OpsPage() {
  const windowDays = Math.max(...SLOS.map((s) => s.windowDays));
  const days = await metricsWindow(windowDays);
  const statuses = computeStatuses(days);
  const alerts = await prisma.alert.findMany({ orderBy: { createdAt: "desc" }, take: 30 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Ops</h1>
      <p className="mb-6 text-sm text-ink-500">
        Error budgets over the last {windowDays} days, from recorded metrics.
      </p>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {statuses.map((s) => (
          <div
            key={s.key}
            className={`rounded-xl border bg-white p-4 ${
              s.breaching ? "border-red-300" : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{s.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  s.breaching ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {s.breaching ? "burning" : "healthy"}
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-brand-700">
              {(s.availability * 100).toFixed(2)}%
            </div>
            <div className="text-xs text-ink-500">target {(s.target * 100).toFixed(1)}%</div>
            <dl className="mt-3 space-y-1 text-xs text-ink-700">
              <div className="flex justify-between">
                <dt>Budget left</dt>
                <dd>{(s.remainingPct * 100).toFixed(0)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt>Burn rate</dt>
                <dd>{Number.isFinite(s.burnRate) ? `${s.burnRate.toFixed(2)}x` : "∞"}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Events</dt>
                <dd>
                  {s.success}/{s.total}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <h2 className="mb-3 font-semibold">Recent alerts</h2>
      <ul className="space-y-2">
        {alerts.length === 0 && <li className="text-ink-500">No alerts. Budgets are healthy.</li>}
        {alerts.map((a) => (
          <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  a.severity === "critical" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                }`}
              >
                {a.severity}
              </span>
              <span className="font-medium">{a.slo}</span>
            </div>
            <p className="mt-1 text-ink-700">{a.message}</p>
            <div className="mt-1 text-xs text-ink-500">{new Date(a.createdAt).toLocaleString("en-IN")}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
