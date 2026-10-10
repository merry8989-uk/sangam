/**
 * Watch and search history policy.
 *
 * The user chooses, separately for each type, what happens to their history:
 *
 *   keep     record it, and never remove it automatically
 *   auto     record it, and delete it after N days
 *   archive  record it, and move it to the archive after N days. Archived rows
 *            are hidden from the list, still stored, and can be restored.
 *   off      do not record it at all
 *
 * History lives in Postgres, not only in cache, so a restart - of the process,
 * the container, or the whole machine - never loses it. Cache sits in front of
 * it for speed; it is not the store of record.
 *
 * Kept pure so the rules can be tested without a database.
 */

export const HISTORY_MODES = ["keep", "auto", "archive", "off"] as const;
export type HistoryMode = (typeof HISTORY_MODES)[number];

export type HistoryType = "watch" | "search";

export type HistoryPolicy = { mode: HistoryMode; days: number };

export const DEFAULT_DAYS = 30;
export const MIN_DAYS = 1;
export const MAX_DAYS = 3650;

export function isHistoryMode(v: unknown): v is HistoryMode {
  return typeof v === "string" && (HISTORY_MODES as readonly string[]).includes(v);
}

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

/** Whether a period is meaningful for this mode. */
export function usesPeriod(mode: HistoryMode): boolean {
  return mode === "auto" || mode === "archive";
}

export function clampDays(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_DAYS;
  if (v < MIN_DAYS) return MIN_DAYS;
  if (v > MAX_DAYS) return MAX_DAYS;
  return v;
}

type SettingsLike = Partial<Record<string, unknown>> | null | undefined;

/**
 * Read one type's policy out of a settings row.
 *
 * The old shape was a single `historyEnabled` boolean plus one `autoDeleteDays`
 * for view history only, and search history had no switch at all. A row written
 * before this change comes back with the new column at its default, so an
 * explicit "keep" is indistinguishable from "never set". The rule below settles
 * it: a mode other than the default wins, otherwise the legacy fields decide.
 * The settings API clears the legacy fields whenever a mode is written, so once
 * a user has chosen, the legacy fields can no longer contradict them.
 */
function policyFor(
  settings: SettingsLike,
  modeKey: string,
  daysKey: string,
  legacy: { enabled?: boolean; days?: number }
): HistoryPolicy {
  const rawMode = settings ? settings[modeKey] : undefined;
  const rawDays = settings ? settings[daysKey] : undefined;

  if (isHistoryMode(rawMode) && rawMode !== "keep") {
    return { mode: rawMode, days: clampDays(rawDays) };
  }

  // Nothing explicit - fall back to how it was stored before.
  if (legacy.enabled === false) return { mode: "off", days: clampDays(rawDays) };
  const legacyDays = typeof legacy.days === "number" ? legacy.days : 0;
  if (legacyDays > 0) return { mode: "auto", days: clampDays(legacyDays) };

  return { mode: "keep", days: clampDays(rawDays) };
}

export function resolveHistoryPolicy(settings: SettingsLike): Record<HistoryType, HistoryPolicy> {
  const historyEnabled = settings ? settings.historyEnabled : undefined;
  const autoDeleteDays = settings ? settings.autoDeleteDays : undefined;

  return {
    // Watch history is the one the old single switch controlled.
    watch: policyFor(settings, "watchHistoryMode", "watchHistoryDays", {
      enabled: typeof historyEnabled === "boolean" ? historyEnabled : undefined,
      days: typeof autoDeleteDays === "number" ? autoDeleteDays : undefined
    }),
    // Search history had no switch at all, so there is nothing to fall back to.
    search: policyFor(settings, "searchHistoryMode", "searchHistoryDays", {})
  };
}

/** Should a new row be written? False only when the user turned recording off. */
export function shouldRecord(policy: HistoryPolicy): boolean {
  return policy.mode !== "off";
}

/** Is there anything for the prune job to do? */
export function shouldPrune(policy: HistoryPolicy): boolean {
  return usesPeriod(policy.mode) && policy.days > 0;
}

/** The timestamp before which rows are due for action, or null if none. */
export function cutoffFor(policy: HistoryPolicy, now: Date = new Date()): Date | null {
  if (!shouldPrune(policy)) return null;
  return new Date(now.getTime() - policy.days * 24 * 60 * 60 * 1000);
}

export type HistoryAction = "keep" | "archive" | "delete";

/**
 * What the prune job should do with one row.
 *
 * "off" deliberately does not delete rows that already exist - it stops new
 * ones being written. Removing what someone already has, silently, the moment
 * they flip a switch is not what that switch says it does; clearing is a
 * separate, explicit action.
 */
export function actionFor(
  row: { timestamp: Date; archived: boolean },
  policy: HistoryPolicy,
  now: Date = new Date()
): HistoryAction {
  if (!shouldPrune(policy)) return "keep";
  const cutoff = cutoffFor(policy, now);
  if (!cutoff) return "keep";
  if (row.timestamp >= cutoff) return "keep";

  if (policy.mode === "auto") return "delete";
  if (policy.mode === "archive") return row.archived ? "keep" : "archive";
  return "keep";
}

/** A short line summarising the policy, for the settings list and the history page. */
export function policySummary(policy: HistoryPolicy): string {
  if (policy.mode === "keep") return "Kept until you clear it";
  if (policy.mode === "off") return "Not recorded";
  if (policy.mode === "auto") return `Deleted after ${policy.days} day${policy.days === 1 ? "" : "s"}`;
  return `Archived after ${policy.days} day${policy.days === 1 ? "" : "s"}`;
}

/** Only the keys this feature owns, for a minimal PUT to the settings API. */
export function historySettingsPatch(
  type: HistoryType,
  policy: HistoryPolicy
): Record<string, unknown> {
  const modeKey = type === "watch" ? "watchHistoryMode" : "searchHistoryMode";
  const daysKey = type === "watch" ? "watchHistoryDays" : "searchHistoryDays";
  const patch: Record<string, unknown> = { [modeKey]: policy.mode, [daysKey]: clampDays(policy.days) };

  // Keep the old fields neutral so they can never contradict an explicit choice.
  if (type === "watch") {
    patch.historyEnabled = policy.mode !== "off";
    patch.autoDeleteDays = policy.mode === "auto" ? clampDays(policy.days) : 0;
  }
  return patch;
}
