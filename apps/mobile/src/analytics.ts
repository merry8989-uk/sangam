import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Dimensions, Platform } from "react-native";
import { BASE_URL, getToken } from "./api";
import {
  SCHEMA_VERSION,
  buildSessionContext,
  validateEvent,
  type EventPlatform,
  type SessionContext
} from "./events";

/**
 * The Android half of the event standard.
 *
 * The same shape as the web client, because the two must join: consent, one
 * session, the same attempt pairing, and the same batching endpoint. The
 * differences are only what the platform forces - AsyncStorage instead of
 * localStorage, `ErrorUtils` instead of `window.onerror`, and `AppState`
 * instead of `pagehide`.
 *
 * The attempt map is the piece that matters. The standard exists because a log
 * showed 71 "access fix requested" entries and not one "fix result": it proved
 * a user was stuck in a loop and could not say why. Here, an attempt opened and
 * never closed is a first-class fact, and `describeOpenAttempts()` puts it in
 * words for a diagnostics report.
 *
 * Nothing here throws. Analytics must never be the reason something breaks.
 */

const CONSENT_KEY = "sangam.analytics.consent";
const SESSION_KEY = "sangam.analytics.session";
const FLUSH_MS = 5000;
const FLUSH_SIZE = 20;
const MAX_BUFFER = 200;
const MAX_SESSION_EVENTS = 500;

type Outgoing = {
  event_name: string;
  schema_version: string;
  timestamp: string;
  session_id: string;
  attempt_id?: string;
  screen_or_route: string;
  log_level: string;
  properties: Record<string, unknown>;
};

let consent: boolean | null = null;
let sessionId = "";
let sessionStartedAt = 0;
let eventCount = 0;
let currentRoute = "/";
let buffer: Outgoing[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

// ------------------------------------------------------------------ consent

/**
 * Has the user agreed to analytics?
 *
 * Off until it is granted, and the grant is the server setting mirrored here.
 * Deliberately separate from diagnostics consent: diagnostics is something a
 * user asks for to report a problem, analytics is something the product does
 * quietly, and those are different asks.
 */
export function analyticsEnabled(): boolean {
  return consent === true;
}

export async function loadConsent(): Promise<boolean> {
  if (consent !== null) return consent;
  try {
    consent = (await AsyncStorage.getItem(CONSENT_KEY)) === "granted";
  } catch {
    consent = false;
  }
  return consent;
}

export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  consent = granted;
  try {
    await AsyncStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    /* storage full or unavailable */
  }
  if (!granted) buffer = [];
}

// ------------------------------------------------------------------ session

function makeId(prefix: string): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * 16)];
  return prefix + out;
}

async function getSessionIdAsync(): Promise<string> {
  if (sessionId) return sessionId;
  try {
    sessionId = (await AsyncStorage.getItem(SESSION_KEY)) ?? "";
  } catch {
    /* ignore */
  }
  if (!sessionId) {
    sessionId = makeId("sess_");
    try {
      await AsyncStorage.setItem(SESSION_KEY, sessionId);
    } catch {
      /* ignore */
    }
  }
  return sessionId;
}

export function setRoute(route: string): void {
  currentRoute = route || "/";
}

/** The device, sent once with `session_start` rather than on every event. */
export function deviceContext(): Partial<SessionContext> {
  const appVersion = [
    Constants.expoConfig?.version ?? "0.0.0",
    Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? ""
  ]
    .filter(Boolean)
    .join(" (") + (Constants.expoConfig?.android?.versionCode ? ")" : "");

  const { width, height } = Dimensions.get("window");
  return {
    platform: "app",
    app_version: appVersion.trim() || "unknown",
    os: `${Platform.OS} ${Platform.Version}`,
    device_model: `${width}x${height}`,
    // Without a connectivity module there is nothing honest to say here. Saying
    // "unknown" is better than guessing "wifi".
    network_type: "unknown",
    release_channel: (Constants.expoConfig?.extra as { releaseChannel?: string } | undefined)?.releaseChannel
      ? ((Constants.expoConfig?.extra as { releaseChannel?: string }).releaseChannel as "production" | "beta" | "development")
      : "development",
    screen_or_route: currentRoute
  };
}

export async function startSession(opts: { cold?: boolean; ms?: number } = {}): Promise<void> {
  if (!(await loadConsent())) return;
  if (sessionStartedAt) return;
  sessionStartedAt = Date.now();
  const full = buildSessionContext(deviceContext());
  track(
    "session_start",
    {
      start_type: opts.cold === false ? "warm" : "cold",
      ...(opts.ms !== undefined
        ? opts.cold === false
          ? { warm_start_ms: opts.ms }
          : { cold_start_ms: opts.ms }
        : {})
    },
    { session: full }
  );
}

export async function endSession(): Promise<void> {
  if (!analyticsEnabled() || !sessionStartedAt) return;
  track("session_end", {
    duration_ms: Date.now() - sessionStartedAt,
    last_screen: currentRoute,
    event_count: eventCount
  });
  await flush();
}

// -------------------------------------------------------------------- track

type TrackOptions = { attemptId?: string; session?: SessionContext };

export function track(
  eventName: string,
  properties: Record<string, unknown> = {},
  opts: TrackOptions = {}
): void {
  if (!analyticsEnabled()) return;
  if (eventCount >= MAX_SESSION_EVENTS) return;
  eventCount += 1;

  const platform: EventPlatform = "app";
  const problems = validateEvent(eventName, properties, platform);
  if (__DEV__ && problems.length) {
    console.warn(`[analytics] ${eventName}: ${problems.join("; ")}`);
  }

  const safeProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) safeProps[k] = redact(v);
  if (problems.length) safeProps.__schema_problems = problems.slice(0, 5);

  buffer.push({
    event_name: eventName,
    schema_version: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    session_id: sessionId || makeId("sess_"),
    ...(opts.attemptId ? { attempt_id: opts.attemptId } : {}),
    screen_or_route: opts.session?.screen_or_route ?? currentRoute,
    log_level: (opts.session ? "info" : levelOf(eventName)),
    properties: safeProps
  });

  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
  if (buffer.length >= FLUSH_SIZE) void flush();
  else schedule();
}

function levelOf(eventName: string): string {
  // A small local copy of the level, so this module does not have to reach into
  // the catalog for a string.
  if (eventName === "crash" || eventName === "js_error" || eventName === "anr") return "error";
  if (eventName === "friction_signal" || eventName === "error_state_shown" || eventName === "search_no_results")
    return "warn";
  if (eventName === "media_query_result" || eventName === "performance_marker" || eventName === "scroll_depth")
    return "debug";
  return "info";
}

/** Redaction, mirroring the web rules. A log line is copied, so nothing secret. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[deep]";
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      // A long base64-looking blob is usually a token or a key.
      if (/^[A-Za-z0-9+/=_-]{40,}$/.test(value)) return "[redacted]";
      return value.length > 400 ? value.slice(0, 400) + "…" : value;
    }
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const SECRET = /pass(word)?|secret|token|api[-_]?key|auth|credential|cookie|session|bearer|private[-_]?key|salt|signature|otp/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    out[k] = SECRET.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

// ---------------------------------------------------- intent and outcome

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

export function abandonAttempt(attemptId: string): void {
  openAttempts.delete(attemptId);
}

export function openAttemptsList(): { attemptId: string; event: string; ms: number; screen: string }[] {
  const now = Date.now();
  return [...openAttempts.entries()].map(([attemptId, a]) => ({
    attemptId,
    event: a.event,
    ms: now - a.at,
    screen: a.screen
  }));
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

/** A short, stable hash. Not a security boundary - just a grouping key. */
export function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * A crash or an unhandled error.
 *
 * The stack is hashed, never stored. The hash groups occurrences; the raw stack
 * is a page of file paths that changes with every build, and the likeliest place
 * for a stray value to be sitting.
 */
export function trackCrash(
  err: unknown,
  opts: { fatal?: boolean; lastAction?: string; event?: "crash" | "js_error" } = {}
): void {
  const isError = err instanceof Error;
  const type = isError ? err.name : typeof err;
  const stack = isError ? (err.stack ?? "") : String(err);
  const hash = hashText(stack.slice(0, 4000));

  if (opts.event === "js_error") {
    track("js_error", { error_type: type, stack_hash: hash, url: currentRoute });
  } else {
    track("crash", {
      fatal: Boolean(opts.fatal),
      exception_type: type,
      stack_trace_hash: hash,
      last_screen: currentRoute,
      ...(opts.lastAction ? { last_action: opts.lastAction } : {})
    });
  }
  void flush();
}

/**
 * Install the handlers. Call once, from the root layout.
 *
 * `ErrorUtils` is React Native's global error hook: the app's equivalent of
 * `window.onerror`, and the only place an uncaught exception passes through.
 */
export function installAnalytics(): void {
  // An uncaught exception. The default handler is kept and called, so the crash
  // still surfaces rather than being swallowed by the reporter.
  const globalAny = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const utils = globalAny.ErrorUtils;
  if (utils?.setGlobalHandler) {
    const previous = utils.getGlobalHandler?.();
    utils.setGlobalHandler((error, isFatal) => {
      try {
        trackCrash(error, { fatal: Boolean(isFatal) });
      } catch {
        /* never let the reporter break the crash path */
      }
      if (previous) previous(error, isFatal);
    });
  }

  // A session ends when the app goes to the background, not when it is killed -
  // there is no callback for the second one.
  AppState.addEventListener("change", (state) => {
    if (state === "background" || state === "inactive") void endSession();
  });
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
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Tells the endpoint this came from the app, so the platform filter works
      // without sniffing a user agent.
      "x-sangam-platform": "app"
    };
    const t = getToken();
    if (t) headers.Authorization = "Bearer " + t;

    const res = await fetch(BASE_URL + "/api/analytics/events", {
      method: "POST",
      headers,
      body: JSON.stringify({ events: batch })
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    // Put them back once. A second failure drops them rather than growing the
    // buffer without bound - a phone with no signal must not become a leak.
    if (buffer.length === 0) buffer = batch;
  } finally {
    flushing = false;
  }
}

/** Everything about this module, for a diagnostics report. */
export function analyticsState(): {
  enabled: boolean;
  eventCount: number;
  openAttempts: string;
  buffered: number;
} {
  return {
    enabled: analyticsEnabled(),
    eventCount,
    openAttempts: describeOpenAttempts(),
    buffered: buffer.length
  };
}
