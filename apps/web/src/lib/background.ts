/**
 * The background layer: rotating, or the user's own.
 *
 * `backgroundMode` and `customBackground` were stored, shown in settings, and
 * read by nothing. A user could pick a daily rotation or paste their own
 * gradient and the app would look exactly the same.
 *
 * The value ends up in a CSS custom property, which means it is user input
 * reaching a stylesheet. That is a real injection surface, so `customBackground`
 * is not passed through - it is matched against a strict allowlist and rejected
 * if it is anything else. `isSafeBackground` is the gate, and it is the reason
 * this file exists as its own tested unit rather than a line in the layout.
 */

export const BACKGROUND_MODES = ["static", "daily", "weekly", "custom"] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

export function isBackgroundMode(v: unknown): v is BackgroundMode {
  return typeof v === "string" && (BACKGROUND_MODES as readonly string[]).includes(v);
}

export function backgroundModeFrom(value: string | null | undefined): BackgroundMode {
  return isBackgroundMode(value) ? value : "static";
}

// --------------------------------------------------------------- the gate

/** A hex colour, three or six digits. */
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
/** rgb() / rgba() / hsl() / hsla() with numbers, percentages and dots only. */
const FUNCTIONAL = /^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/]+\)$/i;
/** One colour, optionally with a stop position. */
const STOP = new RegExp(`^(${HEX.source.slice(1, -1)}|${FUNCTIONAL.source.slice(1, -1)})(\\s+[0-9]{1,3}%)?$`, "i");

/**
 * Split on commas that are not inside parentheses.
 *
 * A colour function contains commas of its own, so a plain split turns
 * `rgb(1,2,3)` into three broken pieces and rejects a perfectly good gradient.
 * Depth-aware, and it also refuses an unbalanced value by returning null.
 */
export function splitStops(value: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (depth !== 0) return null;
  parts.push(current.trim());
  return parts;
}

/**
 * Is this value safe to put in a stylesheet?
 *
 * Deliberately a allowlist, not a denylist. A denylist for CSS is a losing game:
 * `url()`, `expression()`, `@import`, a stray `}` and an escaped newline are all
 * ways out, and there are more. This accepts only what the feature needs - a
 * colour, a gradient of colours, or nothing - and refuses everything else.
 *
 * A refused value is not an error the user sees. It falls back to the theme's
 * own background, because a custom background is decoration.
 */
export function isSafeBackground(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || v.length > 300) return false;
  // No parentheses except the colour functions, no braces, no semicolons, no
  // url(), no comments, no newlines. Checked before anything else because a
  // `}` or a `;` is how a value escapes its declaration.
  if (/[{};\\]/.test(v) || /\/\*/.test(v) || /[\n\r]/.test(v)) return false;
  if (/url\s*\(/i.test(v) || /expression\s*\(/i.test(v) || /@/i.test(v)) return false;

  if (HEX.test(v) || FUNCTIONAL.test(v)) return true;

  // linear-gradient(<angle>?, stop, stop, ...)
  // The argument list runs to the LAST closing paren, so a stop that is itself a
  // function is not cut short.
  const grad = /^linear-gradient\(\s*(.+)\s*\)$/i.exec(v);
  if (!grad) return false;

  const inner = grad[1];
  const split = splitStops(inner);
  if (!split) return false;

  // A leading angle is allowed: linear-gradient(45deg, #fff, #000)
  const stops = /^[0-9]{1,3}deg$/i.test(split[0]) ? split.slice(1) : split;
  if (stops.length < 2 || stops.length > 8) return false;
  return stops.every((s) => STOP.test(s));
}

// ------------------------------------------------------------ resolution

/** A small, fixed palette for the rotation. Stable, so a day looks the same twice. */
const ROTATION = [
  "#0f172a", "#111827", "#1e1b4b", "#172554", "#134e4a",
  "#1c1917", "#3b0764", "#450a0a", "#052e16", "#082f49"
];

/** Days since the epoch, for a rotation that changes at midnight UTC. */
function dayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/** ISO week number, matching the theme engine's own rotation. */
function weekIndex(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export type BackgroundResolution = {
  /** A safe CSS value, or null for "use the theme's own". */
  value: string | null;
  /** Why, for the log or the settings preview. */
  reason: "static" | "rotating" | "custom" | "custom rejected";
};

/**
 * What background to use, given the settings and a date.
 *
 * Pure: the same inputs always give the same answer, so the rotation can be
 * tested without waiting for a week to pass.
 */
export function resolveBackground(
  opts: { mode?: string | null; custom?: string | null; date?: Date } = {}
): BackgroundResolution {
  const mode = backgroundModeFrom(opts.mode);
  const date = opts.date ?? new Date();

  if (mode === "custom") {
    const custom = (opts.custom ?? "").trim();
    if (!custom) return { value: null, reason: "static" };
    return isSafeBackground(custom)
      ? { value: custom, reason: "custom" }
      : { value: null, reason: "custom rejected" };
  }

  if (mode === "daily") {
    return { value: ROTATION[dayIndex(date) % ROTATION.length], reason: "rotating" };
  }

  if (mode === "weekly") {
    return { value: ROTATION[(weekIndex(date) * 3) % ROTATION.length], reason: "rotating" };
  }

  return { value: null, reason: "static" };
}

/** The variable the layout sets and the stylesheet reads. */
export const BACKGROUND_VAR = "--sangam-background";
