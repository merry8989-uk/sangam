"use client";

import { evictForCapacity, makeSessionId, type DiagEntry, type DiagOutcome, type DiagSeverity } from "./diagnostics";

/**
 * Records what goes wrong, on the device, without the user doing anything.
 *
 * Two things matter here:
 *
 *  - It survives a reload. The buffer is mirrored into localStorage, because
 *    the moment you most need a log is the moment after the page broke, and an
 *    in-memory buffer would be gone by then.
 *  - It stays bounded. A fixed number of entries, and each message is clipped,
 *    so a runaway error loop cannot fill the device's storage.
 *
 * Nothing here sends anything anywhere. It records locally; the user decides
 * whether to share it.
 */

const STORAGE_KEY = "sangam.diagnostics.v1";
const MAX_ENTRIES = 200;
const MAX_MESSAGE = 500;
const MAX_DETAIL_KEYS = 12;
/**
 * A successful request slower than this is recorded. Recording every success
 * would drown the failures - which is exactly the mistake that leaves you with
 * a log full of attempts and no outcomes. Set to 0 to record none.
 */
const SLOW_MS = 3000;

let enabled = false;
let installed = false;
let buffer: DiagEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function nowIso(): string {
  return new Date().toISOString();
}

function clip(s: unknown, max = MAX_MESSAGE): string {
  const t = typeof s === "string" ? s : safeString(s);
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function safeString(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserialisable]";
  }
}

/** Keep a detail object small and shallow - a huge object helps nobody. */
function shrinkDetail(detail?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(detail)) {
    if (n++ >= MAX_DETAIL_KEYS) break;
    out[k] = typeof v === "object" && v !== null ? clip(safeString(v), 200) : v;
  }
  return Object.keys(out).length ? out : undefined;
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) buffer = parsed.slice(-MAX_ENTRIES);
  } catch {
    buffer = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_ENTRIES)));
  } catch {
    // storage full or blocked - recording still works for this session
  }
}

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must never break recording */
    }
  }
}

let sessionId = "";

/** One id per page load, so a report can be tied to a single session. */
export function getSessionId(): string {
  if (sessionId) return sessionId;
  sessionId = makeSessionId();
  return sessionId;
}

export function record(
  severity: DiagSeverity,
  kind: string,
  message: unknown,
  detail?: Record<string, unknown>,
  outcome?: DiagOutcome
): void {
  if (!enabled) return;
  load();
  buffer.push({
    at: nowIso(),
    kind,
    severity,
    outcome,
    sessionId: getSessionId(),
    message: clip(message),
    detail: shrinkDetail(detail)
  });
  // Errors are kept at full rate; the sampled events give way first.
  buffer = evictForCapacity(buffer, MAX_ENTRIES);
  persist();
  notify();
}

export function getEntries(): DiagEntry[] {
  load();
  return buffer.slice();
}

export function clearEntries(): void {
  load();
  buffer = [];
  persist();
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isRecording(): boolean {
  return enabled;
}

/** Should this URL be skipped? Recording our own report would be a loop. */
function skipUrl(url: string): boolean {
  return url.includes("/api/diagnostics");
}

/**
 * Start recording. Safe to call more than once.
 */
export function installCapture(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    record(
      "error",
      "unhandled",
      err ? `${err.name}: ${err.message}` : event.message,
      { file: event.filename ? event.filename.split("/").pop() : "", line: event.lineno, column: event.colno },
      "failure"
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    const err = reason instanceof Error ? reason : undefined;
    record(
      "error",
      "unhandled",
      err ? `Promise: ${err.name}: ${err.message}` : `Promise: ${safeString(reason)}`,
      { stack: err?.stack ? clip(err.stack.split("\n").slice(0, 3).join(" | "), 300) : undefined },
      "failure"
    );
  });

  // A failed request is the most useful thing in the report, so fetch is
  // wrapped. The wrapper never changes behaviour: the response is returned
  // exactly as it arrived.
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    const started = Date.now();
    try {
      const res = await originalFetch(input, init);
      const ms = Date.now() - started;
      if (!skipUrl(url)) {
        if (!res.ok) {
          // Every failure, always.
          record(
            res.status >= 500 ? "error" : "warn",
            "request",
            `${method} ${stripOrigin(url)} -> ${res.status}`,
            { ms, status: res.status },
            "failure"
          );
        } else if (SLOW_MS > 0 && ms >= SLOW_MS) {
          // A slow success is worth recording; a fast one is not, or the buffer
          // would fill with noise. This is the sampled half.
          record(
            "info",
            "request",
            `${method} ${stripOrigin(url)} -> ${res.status} (slow)`,
            { ms, status: res.status },
            "success"
          );
        }
      }
      return res;
    } catch (err) {
      if (!skipUrl(url)) {
        record(
          "error",
          "request",
          `${method} ${stripOrigin(url)} failed: ${safeString(err)}`,
          { ms: Date.now() - started },
          "failure"
        );
      }
      throw err;
    }
  };
}

function stripOrigin(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + (u.search ? "?…" : "");
  } catch {
    return url.slice(0, 120);
  }
}

/** Turn recording on or off. Turning it off clears what was already held. */
export function setRecording(on: boolean): void {
  enabled = on;
  if (on) {
    installCapture();
  } else {
    clearEntries();
  }
}

/**
 * The environment block, gathered from the browser.
 */
export function clientInfo(appVersion: string) {
  if (typeof window === "undefined") return null;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number };
    userAgentData?: { platform?: string };
  };
  return {
    platform: "web",
    appVersion,
    route: window.location.pathname + (window.location.search ? "?…" : ""),
    userAgent: clip(nav.userAgent, 300),
    language: nav.language ?? "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    online: nav.onLine,
    memoryMb: typeof nav.deviceMemory === "number" ? nav.deviceMemory * 1024 : undefined,
    connection: nav.connection?.effectiveType,
    startedAt: new Date(performance.timeOrigin || Date.now()).toISOString(),
    sessionId: getSessionId()
  };
}

/**
 * Can this device hand a file to another app?
 *
 * On Android Chrome and iOS Safari it can, which is what lets a report reach
 * Gmail already attached. On desktop browsers it generally cannot, so the UI
 * falls back to the server send or to Gmail compose.
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    const probe = new File(["x"], "probe.txt", { type: "text/plain" });
    return nav.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Hand the report to the system share sheet as a file. The user picks Gmail (or
 * anything else) and the file is already attached.
 *
 * Returns false when the platform cannot do it, so the caller can fall back.
 */
export async function shareReportFile(text: string, filename: string, mime: string): Promise<boolean> {
  if (!canShareFiles()) return false;
  try {
    const file = new File([text], filename, { type: mime });
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch {
    // The user dismissed the sheet, or the share failed.
    return false;
  }
}
