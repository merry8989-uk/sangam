import { sumFields, type DayMetrics } from "./metrics";

// Service level objectives. Each defines a target availability over a window;
// the error budget is how much failure that target allows.
export type SloDef = { key: string; name: string; target: number; windowDays: number };

export const SLOS: SloDef[] = [
  { key: "ai", name: "AI dependency", target: 0.99, windowDays: 30 },
  { key: "jobs", name: "Background jobs", target: 0.995, windowDays: 30 },
  { key: "api", name: "API routes (instrumented)", target: 0.995, windowDays: 30 }
];

export type SloStatus = {
  key: string;
  name: string;
  target: number;
  windowDays: number;
  success: number;
  total: number;
  availability: number;
  allowedFailures: number;
  consumed: number;
  remaining: number;
  remainingPct: number;
  burnRate: number;
  breaching: boolean;
};

// Burn-rate alerting: warn once a quarter of the budget is gone, or when the
// budget is being spent more than twice as fast as the window allows.
const REMAINING_WARN = 0.25;
const BURN_WARN = 2;

export function evaluateSlo(def: SloDef, success: number, total: number): SloStatus {
  const allowedFailures = total * (1 - def.target);
  const consumed = Math.max(0, total - success);
  const remaining = Math.max(0, allowedFailures - consumed);
  const remainingPct = allowedFailures > 0 ? remaining / allowedFailures : 1;
  const burnRate = allowedFailures > 0 ? consumed / allowedFailures : consumed > 0 ? Infinity : 0;
  const availability = total > 0 ? success / total : 1;

  return {
    key: def.key,
    name: def.name,
    target: def.target,
    windowDays: def.windowDays,
    success,
    total,
    availability,
    allowedFailures,
    consumed,
    remaining,
    remainingPct,
    burnRate,
    breaching: total > 0 && (remainingPct < REMAINING_WARN || burnRate > BURN_WARN)
  };
}

// Derive each SLO's numbers from the recorded metric fields.
export function computeStatuses(days: DayMetrics[]): SloStatus[] {
  const aiOk = sumFields(days, (f) => f === "ai:ok");
  const aiFail = sumFields(days, (f) => f === "ai:fail");
  const jobOk = sumFields(days, (f) => /^job:.*:ok$/.test(f));
  const jobFail = sumFields(days, (f) => /^job:.*:fail$/.test(f));
  const routeTotal = sumFields(days, (f) => /^route:/.test(f));
  const routeErrors = sumFields(days, (f) => /^route:.*:5xx$/.test(f));

  return [
    evaluateSlo(SLOS[0], aiOk, aiOk + aiFail),
    evaluateSlo(SLOS[1], jobOk, jobOk + jobFail),
    evaluateSlo(SLOS[2], routeTotal - routeErrors, routeTotal)
  ];
}
