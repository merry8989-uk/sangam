// Minimal cron matcher for agent scheduled tasks.
// Supports five fields, but only the minute and hour are interpreted;
// day-of-month, month and day-of-week must be "*".
//   "0 9 * * *"    -> every day at 09:00
//   "*/15 * * * *" -> every 15 minutes
//   "30 * * * *"   -> every hour at :30
export function matchesCron(expr: string, date: Date = new Date()): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*") return false;

  const field = (spec: string, value: number): boolean => {
    if (spec === "*") return true;
    if (spec.startsWith("*/")) {
      const step = Number(spec.slice(2));
      return step > 0 && value % step === 0;
    }
    return Number(spec) === value;
  };

  return field(minute, date.getMinutes()) && field(hour, date.getHours());
}
