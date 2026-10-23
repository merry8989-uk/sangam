"use client";

/**
 * The client side of the event standard: consent, the session, and the pairing
 * of an intent with its outcome.
 *
 * The piece worth reading is the attempt map at the bottom. The standard exists
 * because a log showed 71 "access fix requested" entries and not one "fix
 * result": it proved a user was stuck in a loop and could not say why. Here, an
 * attempt that is opened and never closed is a first-class fact - `openAttempts()`
 * returns them, and a diagnostics report says so in words.
 *
 * Everything is buffered and flushed, so a burst of events is one request rather
 * than forty. Nothing here throws: analytics must never be the reason something
 * breaks.
 */

import { redactValue } from "./diagnostics";
import {
  SCHEMA_VERSION,
  buildSessionContext,
  categoryForEvent,
  severityForEvent,
  validateEvent,
  type EventPlatform,
  type SessionContext
} from "./events";

const CONSENT_KEY = "sangam.analytics.consent";
const SESSION_KEY = "sangam.analytics.session";
const FLUSH_MS = 4000;
const FLUSH_SIZE = 20;
const MAX_BUFFER = 200;
const MAX_SESSION_EVENTS = 500;

type Outgoing = {
  event_name: string;
  schema_version: string;
  timestamp: string;
  session_id: string;
  attempt_id?: string;
  user_id?: string;
  screen_or_route: string;
  log_level: string;
  properties: Record<string, unknown>;
};

let consent: boolean | null = null;
let sessionId = "";
let sessionStartedAt = 0;
let eventCount = 0;
let platform: EventPlatform = "web";
let currentRoute = "/";
let buffer: Outgoing[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

// ------------------------------------------------------------------ consent

/**
 * Has the user agreed to analytics?
 *
 * Deliberately separate from diagnostics consent. Diagnostics is something a
 * user asks for, to send a report about a problem; analytics is something the
 * product does quietly. They are different asks and the standard wants a gate
 * on this one.
 */
export function analyticsEnabled(): boolean {
  if (consent !== null) return consent;
  try {
    consent = window.localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    consent = false;
  }
  return consent;
}

export function setAnalyticsConsent(granted: boolean): void {
  consent = granted;
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    /* private mode */
  }
  if (!granted) buffer = [];
}

// ------------------------------------------------------------------ session

function makeId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getSessionId(): string {
  if (sessionId) return sessionId;
  try {
    sessionId = window.sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    /* ignore */
  }
  if (!sessionId) {
    sessionId = makeId("sess_");
    try {
      window.sessionStorage.setItem(SESSION_KEY, sessionId);
    } catch {
      /* ignore */
    }
  }
  return sessionId;
}

export function setRoute(route: string): void {
  currentRoute = route || "/";
}

export function currentSessionId(): string {
  return getSessionId();
}

/**
 * Start a session. Sends the context once, with `session_start`.
 *
 * The standard is explicit that the device, OS and version go with the session
 * rather than on every event. Repeating them is the largest waste in a log at
 * scale, and it is what makes a log unreadable when you are looking for a
 * pattern rather than a single line.
 */
export function startSession(ctx: Partial<SessionContext> = {}, opts: { cold?: boolean; ms?: number } = {}): void {
  if (!analyticsEnabled()) return;
  if (sessionStartedAt) return;
  sessionStartedAt = Date.now();
  platform = ctx.platform === "app" ? "app" : "web";
  const full = buildSessionContext({ ...ctx, screen_or_route: ctx.screen_or_route ?? currentRoute });

  track(
    "session_start",
    {
      start_type: opts.cold === false ? "warm" : "cold",
      ...(opts.ms !== undefined ? (opts.cold === false ? { warm_start_ms: opts.ms } : { cold_start_ms: opts.ms }) : {})
    },
    { session: full }
  );
}

export function endSession(): void {
  if (!analyticsEnabled() || !sessionStartedAt) return;
  track("session_end", {
    duration_ms: Date.now() - sessionStartedAt,
    last_screen: currentRoute,
    event_count: eventCount
  });
  void flush();
}

// -------------------------------------------------------------------- track

type TrackOptions = {
  attemptId?: string;
  /** Only on session_start. */
  session?: SessionContext;
};

/**
 * Record one event.
 *
 * Validated against the catalog in development, so a mistake is caught where it
 * is made rather than in a dashboard three weeks later. In production an invalid
 * event is still sent - losing the data is worse than a slightly wrong property -
 * but the problem is attached to the event so it can be found.
 */
export function track(eventName: string, properties: Record<string, unknown> = {}, opts: TrackOptions = {}): void {
  if (!analyticsEnabled()) return;
  if (eventCount >= MAX_SESSION_EVENTS) return;
  eventCount += 1;

  const problems = validateEvent(eventName, properties, platform);

  if (process.env.NODE_ENV !== "production" && problems.length) {
    console.warn(`[analytics] ${eventName}: ${problems.join("; ")}`);
  }

  const safeProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) safeProps[k] = redactValue(v, 3);
  if (problems.length) safeProps.__schema_problems = problems.slice(0, 5);

  buffer.push({
    event_name: eventName,
    schema_version: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    session_id: getSessionId(),
    ...(opts.attemptId ? { attempt_id: opts.attemptId } : {}),
    screen_or_route: opts.session?.screen_or_route ?? currentRoute,
    log_level: severityForEvent(eventName).toLowerCase(),
    properties: safeProps
  });

  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  schedule();
}

// ---------------------------------------------------- intent and outcome

/**
 * Attempts that were opened and never closed, by attempt id.
 *
 * This is the map that answers the question the standard was written for: which
 * user actions were started and never finished.
 */
const openAttempts = new Map<string, { event: string; at: number; screen: string }>();

/**
 * Begin an action that has a result. Returns the id to pass to `endAttempt`.
 *
 *   const id = beginAttempt("access_fix_requested", { permission: "media", state_before: "denied" });
 *   ...
 *   endAttempt(id, "access_fix_result", { action_taken: "open_settings", state_after: "granted", outcome: "success" });
 */
export function beginAttempt(eventName: string, properties: Record<string, unknown> = {}): string {
  const id = makeId("att_");
  openAttempts.set(id, { event: eventName, at: Date.now(), screen: currentRoute });
  track(eventName, properties, { attemptId: id });
  return id;
}

export function endAttempt(attemptId: string, resultEvent: string, properties: Record<string, unknown> = {}): void {
  openAttempts.delete(attemptId);
  track(resultEvent, properties, { attemptId });
}

/** The attempts still waiting for an outcome. */
export function openAttemptsList(): { attemptId: string; event: string; ms: number; screen: string }[] {
  const now = Date.now();
  return [...openAttempts.entries()].map(([attemptId, a]) => ({
    attemptId,
    event: a.event,
    ms: now - a.at,
    screen: a.screen
  }));
}

/** Give up on an attempt that will never finish, so it is not reported as stuck. */
export function abandonAttempt(attemptId: string): void {
  openAttempts.delete(attemptId);
}

/**
 * A plain sentence about the open attempts, for a diagnostics report.
 *
 * The point of the whole standard in one line: a report should be able to say
 * "3 actions were started and never finished", not just list what was tried.
 */
export function describeOpenAttempts(): string {
  const open = openAttemptsList();
  if (!open.length) return "no unfinished actions";
  const byEvent = new Map<string, number>();
  for (const a of open) byEvent.set(a.event, (byEvent.get(a.event) ?? 0) + 1);
  return (
    `${open.length} action(s) started and never finished: ` +
    [...byEvent.entries()].map(([e, n]) => `${e} x${n}`).join(", ")
  );
}

// ------------------------------------------------------- friction and crashes

/**
 * Something looked usable and was not.
 *
 * Three taps on the same element inside two seconds is a rage click; a tap that
 * changes nothing is a dead click; three backs inside two seconds is someone
 * lost. One event carries all of them, told apart by `signal`, so a new signal
 * is a value rather than a new event.
 */
export function trackFriction(
  signal: "rage_click" | "dead_click" | "back_button_spam" | "permission_loop",
  element: string,
  opts: { count?: number; windowMs?: number } = {}
): void {
  track("friction_signal", {
    signal,
    element: element.slice(0, 120),
    ...(opts.count !== undefined ? { count: opts.count } : {}),
    ...(opts.windowMs !== undefined ? { window_ms: opts.windowMs } : {})
  });
}

/**
 * A crash or an unhandled error.
 *
 * The stack is hashed, never stored. The hash groups occurrences of the same
 * failure; the raw stack is a page of file paths and line numbers that changes
 * with every deploy, and it is the most likely place for a stray value to be
 * sitting.
 */
export async function trackCrash(
  err: unknown,
  opts: { fatal?: boolean; lastAction?: string; event?: string } = {}
): Promise<void> {
  const isError = err instanceof Error;
  const type = isError ? err.name : typeof err;
  const stack = isError ? (err.stack ?? "") : String(err);
  const hash = await hashText(stack.slice(0, 4000));

  track(
    opts.event === "js_error" ? "js_error" : "crash",
    opts.event === "js_error"
      ? { error_type: type, stack_hash: hash, url: currentRoute }
      : { fatal: Boolean(opts.fatal), exception_type: type, stack_trace_hash: hash, last_screen: currentRoute, ...(opts.lastAction ? { last_action: opts.lastAction } : {}) }
  );
  // A crash is the one thing worth sending straight away.
  void flush();
}

/** A short, stable hash. Not a security boundary - just a grouping key. */
export async function hashText(text: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // No SubtleCrypto (an insecure origin). A cheap fallback is enough here.
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).padStart(8, "0");
  }
}

// ---------------------------------------------------------------- transport

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => void flush(), FLUSH_MS);
}

/** Send what is buffered. Safe to call at any time; never throws. */
export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer;
  buffer = [];
  try {
    const res = await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    // Put them back once. A second failure drops them rather than growing the
    // buffer without bound - an offline tab must not become a memory leak.
    if (buffer.length === 0) buffer = batch;
  } finally {
    flushing = false;
  }
}

/** Everything about this module, for a diagnostics report. */
export function analyticsState(): {
  enabled: boolean;
  sessionId: string;
  eventCount: number;
  openAttempts: string;
  buffered: number;
} {
  return {
    enabled: analyticsEnabled(),
    sessionId: getSessionId(),
    eventCount,
    openAttempts: describeOpenAttempts(),
    buffered: buffer.length
  };
}

export { categoryForEvent };
