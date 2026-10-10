/**
 * Watch and search history policy, for the mobile app.
 *
 * Mirrors apps/web/src/lib/history.ts: same modes, same labels, same clamping.
 * Duplicated rather than shared because the two apps are separate packages with
 * no shared build step - keep the two in step when you change one.
 *
 * The rows themselves live in Postgres on the server, so nothing here stores
 * history; this is only the policy the settings screen reads and writes.
 */

export const HISTORY_MODES = ["keep", "auto", "archive", "off"] as const;
export type HistoryMode = (typeof HISTORY_MODES)[number];
export type HistoryType = "watch" | "search";

export const DEFAULT_DAYS = 30;
export const MIN_DAYS = 1;
export const MAX_DAYS = 3650;

export function modeLabel(mode: HistoryMode): string {
  switch (mode) {
    case "keep":
      return "Keep";
    case "auto":
      return "Delete after a period";
    case "archive":
      return "Move to archive after a period";
    case "off":
      return "Do not record";
    default:
      return "Keep";
  }
}

export function modeHint(mode: HistoryMode, type: HistoryType): string {
  const what = type === "watch" ? "What you watch" : "What you search for";
  switch (mode) {
    case "keep":
      return `${what} is kept until you clear it yourself.`;
    case "auto":
      return `${what} is removed automatically once it is older than the period.`;
    case "archive":
      return `${what} moves to the archive once it is older than the period. It is still stored, and you can restore it.`;
    case "off":
      return `${what} is not recorded at all. Nothing new is stored, here or anywhere.`;
    default:
      return "";
  }
}

export function usesPeriod(mode: HistoryMode): boolean {
  return mode === "auto" || mode === "archive";
}

export function clampDays(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_DAYS;
  if (v < MIN_DAYS) return MIN_DAYS;
  if (v > MAX_DAYS) return MAX_DAYS;
  return v;
}
