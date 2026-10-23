/**
 * The log record, and the rules about what may go in one.
 *
 * This follows the logging standard the project works to: twelve categories,
 * six severities, and one envelope every record carries - `timestamp`,
 * `severity`, `category`, `message`, `app_id`, `environment`, `request_id` -
 * with sanitised metadata on top.
 *
 * Kept free of framework and database imports so the severity ordering, the
 * category list, the redaction and the sampling can all be tested directly.
 * The redaction is the part that matters most: a log line is copied into
 * backups, into an export, and into a support ticket, so anything that reaches
 * one has left the building.
 */

import { isSecretKey, redactText, redactValue, REDACTED } from "./diagnostics";
import { ATTEMPT_OPENERS } from "./events";

/** The six levels, quietest first. Order is load-bearing. */
export const LOG_SEVERITIES = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;
export type LogSeverity = (typeof LOG_SEVERITIES)[number];

/** The twelve categories from the standard. */
export const LOG_CATEGORIES = [
  "APPLICATION", // the app doing something ordinary
  "ERROR", // a crash, an exception, an invalid value
  "SECURITY", // failed login, permission refused, something suspicious
  "PERFORMANCE", // how long something took
  "ACTIVITY", // a person did something
  "INFRA", // start, stop, health, deploy
  "API", // a request in or out
  "DATABASE", // a query, a connection, a migration
  "AUDIT", // an authorised change to a resource
  "ANALYTICS", // a business metric
  "JOB", // a scheduled or background task
  "TRACE" // detailed execution, for development
] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

/** How long each category is kept, in days. The standard asks for retention. */
export const DEFAULT_RETENTION_DAYS: Record<LogCategory, number> = {
  TRACE: 3,
  APPLICATION: 30,
  ERROR: 90,
  SECURITY: 180,
  PERFORMANCE: 14,
  ACTIVITY: 30,
  INFRA: 90,
  API: 14,
  DATABASE: 30,
  AUDIT: 365,
  ANALYTICS: 365,
  JOB: 60
};

export type LogMetadata = Record<string, unknown>;

export type LogRecord = {
  /** ISO 8601, UTC. */
  ts: string;
  severity: LogSeverity;
  category: LogCategory;
  message: string;
  /** Which application wrote it: web, mobile, ai, worker. */
  appId: string;
  environment: string;
  /** Ties records from one request together, across services. */
  requestId: string | null;
  /** Who it was about, when there is someone. A pseudonymous code, not an id. */
  actorCode?: string | null;
  /** The route or job that produced it. */
  source?: string | null;

  // ---- the event standard ----
  // A log record and an analytics event are the same object seen from two
  // angles, so these ride on the same envelope rather than in a parallel table.
  // That is what lets one query join "what broke" to "what the user was doing".
  /** `object_action` in snake_case. Null for a plain log line. */
  eventName?: string | null;
  /** The event schema this was written against. */
  schemaVersion?: string | null;
  /** One id per app launch or visit. */
  sessionId?: string | null;
  /**
   * Groups the intent and the outcome of one user action.
   *
   * The standard exists because of a log that showed 71 "access fix requested"
   * entries and no "fix result". Both halves now carry the same attempt id, so
   * a request with no result is visible as exactly that.
   */
  attemptId?: string | null;

  metadata: LogMetadata;
};

export function isLogSeverity(v: unknown): v is LogSeverity {
  return typeof v === "string" && (LOG_SEVERITIES as readonly string[]).includes(v);
}

export function isLogCategory(v: unknown): v is LogCategory {
  return typeof v === "string" && (LOG_CATEGORIES as readonly string[]).includes(v);
}

/** 0 for TRACE up to 5 for FATAL. Unknown values sort as the quietest. */
export function severityRank(severity: LogSeverity): number {
  const i = LOG_SEVERITIES.indexOf(severity);
  return i === -1 ? 0 : i;
}

export function severityAtLeast(severity: LogSeverity, minimum: LogSeverity): boolean {
  return severityRank(severity) >= severityRank(minimum);
}

/** The level the process writes at, from LOG_LEVEL. Defaults to INFO. */
export function levelFromEnv(env: Record<string, string | undefined> = process.env): LogSeverity {
  const raw = (env.LOG_LEVEL ?? "").trim().toUpperCase();
  return isLogSeverity(raw) ? raw : "INFO";
}

/**
 * The application name, from APP_ID or the platform. A log from the web tier
 * and a log from the AI service should be tellable apart without a join.
 */
export function appIdFromEnv(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_ID ?? "").trim() || "web";
}

export function environmentFromEnv(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_ENV ?? env.NODE_ENV ?? "development").trim();
}

export const MAX_MESSAGE = 1000;
export const MAX_METADATA_KEYS = 20;
export const MAX_METADATA_DEPTH = 4;

/**
 * Build a record.
 *
 * Normalises what it is given, redacts it, and clips it. Nothing reaches a sink
 * without passing through here, which is what makes the redaction guarantee
 * hold: there is no other way in.
 */
export function buildRecord(input: {
  severity: LogSeverity;
  category: LogCategory;
  message: unknown;
  appId?: string;
  environment?: string;
  requestId?: string | null;
  actorCode?: string | null;
  source?: string | null;
  eventName?: string | null;
  schemaVersion?: string | null;
  sessionId?: string | null;
  attemptId?: string | null;
  metadata?: LogMetadata;
  now?: Date;
}): LogRecord {
  const now = input.now ?? new Date();
  const rawMessage = typeof input.message === "string" ? input.message : safeString(input.message);

  return {
    ts: now.toISOString(),
    severity: input.severity,
    category: input.category,
    message: redactText(rawMessage, MAX_MESSAGE),
    appId: input.appId ?? appIdFromEnv(),
    environment: input.environment ?? environmentFromEnv(),
    requestId: input.requestId ?? null,
    actorCode: input.actorCode ?? null,
    source: input.source ?? null,
    eventName: input.eventName ?? null,
    schemaVersion: input.schemaVersion ?? null,
    sessionId: input.sessionId ?? null,
    attemptId: input.attemptId ?? null,
    metadata: redactMetadata(input.metadata ?? {})
  };
}

/** Metadata, redacted and bounded: a log line is not a place for a payload. */
export function redactMetadata(metadata: LogMetadata): LogMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const entries = Object.entries(metadata).slice(0, MAX_METADATA_KEYS);
  const out: LogMetadata = {};
  for (const [key, value] of entries) {
    // The key is checked first. Checking only the value missed
    // `{ password: "hunter2" }` entirely: the value looks like an ordinary
    // word, and it is the name that says it is not.
    out[key] = isSecretKey(key) ? REDACTED : redactValue(value, MAX_METADATA_DEPTH);
  }
  return out;
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

/** An Error, reduced to something a log can carry without a stack dump. */
export function errorMetadata(err: unknown): LogMetadata {
  if (!(err instanceof Error)) return { value: safeString(err) };
  return {
    errorName: err.name,
    errorMessage: redactText(err.message, 400),
    // A hash, not the stack: the stack is full of file paths and line numbers
    // that change every deploy, and it is the most likely place for a stray
    // value to be sitting.
    stackHead: err.stack ? redactText(err.stack.split("\n").slice(0, 2).join(" | "), 300) : null
  };
}

/**
 * Should this record be sampled away?
 *
 * The standard asks for sampling at scale: keep every error, sample the
 * high-volume ordinary ones. TRACE and DEBUG go first, then ACTIVITY and API.
 * `roll` is injected so the decision is testable.
 */
export const SAMPLE_RATE: Record<LogCategory, number> = {
  TRACE: 0.05,
  API: 0.25,
  ACTIVITY: 0.5,
  PERFORMANCE: 0.5,
  APPLICATION: 1,
  ANALYTICS: 1,
  DATABASE: 1,
  INFRA: 1,
  JOB: 1,
  SECURITY: 1,
  AUDIT: 1,
  ERROR: 1
};

export function shouldSample(
  severity: LogSeverity,
  category: LogCategory,
  roll: number
): boolean {
  // Nothing at WARN or above is ever dropped, whatever the category.
  if (severityRank(severity) >= severityRank("WARN")) return true;
  const rate = SAMPLE_RATE[category] ?? 1;
  return roll < rate;
}

/** One line, for a console or a stream. */
export function formatLine(record: LogRecord): string {
  const parts = [
    record.ts,
    record.severity.padEnd(5),
    record.category.padEnd(11),
    record.appId,
    record.requestId ? `req=${record.requestId.slice(0, 8)}` : null,
    record.source ? `src=${record.source}` : null,
    record.eventName ? `evt=${record.eventName}` : null,
    record.attemptId ? `att=${record.attemptId.slice(0, 8)}` : null,
    record.actorCode ? `who=${record.actorCode}` : null,
    record.message
  ].filter(Boolean);
  const meta = Object.keys(record.metadata).length ? ` ${JSON.stringify(record.metadata)}` : "";
  return parts.join(" ") + meta;
}

/** A filter over stored records. An absent field means no opinion. */
export type LogFilter = {
  severities?: LogSeverity[];
  categories?: LogCategory[];
  source?: string;
  actorCode?: string;
  requestId?: string;
  text?: string;
  since?: string;
  until?: string;
  // ---- the event standard ----
  eventNames?: string[];
  sessionId?: string;
  /** Filters to one attempt, which is how the intent and its outcome meet. */
  attemptId?: string;
};

export const EMPTY_LOG_FILTER: LogFilter = {};

function matches<T>(value: T | undefined | null, allowed: T[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return value !== undefined && value !== null && allowed.includes(value);
}

/** The matching rules, in one place, so the API and the screen agree. */
export function filterRecords(records: LogRecord[], filter: LogFilter = EMPTY_LOG_FILTER): LogRecord[] {
  const text = filter.text?.trim().toLowerCase();
  const since = filter.since ? Date.parse(filter.since) : NaN;
  const until = filter.until ? Date.parse(filter.until) : NaN;

  return records.filter((r) => {
    if (!matches(r.severity, filter.severities)) return false;
    if (!matches(r.category, filter.categories)) return false;
    if (filter.source && r.source !== filter.source) return false;
    if (filter.actorCode && r.actorCode !== filter.actorCode) return false;
    if (filter.requestId && r.requestId !== filter.requestId) return false;
    if (filter.eventNames?.length && !(r.eventName && filter.eventNames.includes(r.eventName))) return false;
    if (filter.sessionId && r.sessionId !== filter.sessionId) return false;
    if (filter.attemptId && r.attemptId !== filter.attemptId) return false;
    if (text) {
      const hay = `${r.message} ${JSON.stringify(r.metadata)}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (!Number.isNaN(since) || !Number.isNaN(until)) {
      const at = Date.parse(r.ts);
      if (Number.isNaN(at)) return false;
      if (!Number.isNaN(since) && at < since) return false;
      if (!Number.isNaN(until) && at > until) return false;
    }
    return true;
  });
}

export function logFilterIsActive(filter: LogFilter = EMPTY_LOG_FILTER): boolean {
  return Boolean(
    filter.severities?.length ||
      filter.categories?.length ||
      filter.source ||
      filter.actorCode ||
      filter.requestId ||
      filter.eventNames?.length ||
      filter.sessionId ||
      filter.attemptId ||
      filter.text?.trim() ||
      filter.since ||
      filter.until
  );
}

/** The values present, so a filter offers real choices. */
export function logFacets(records: LogRecord[]): {
  severities: LogSeverity[];
  categories: LogCategory[];
  sources: string[];
  eventNames: string[];
} {
  const sev = new Set<LogSeverity>();
  const cat = new Set<LogCategory>();
  const src = new Set<string>();
  const evt = new Set<string>();
  for (const r of records) {
    sev.add(r.severity);
    cat.add(r.category);
    if (r.source) src.add(r.source);
    if (r.eventName) evt.add(r.eventName);
  }
  return {
    severities: LOG_SEVERITIES.filter((s) => sev.has(s)),
    categories: LOG_CATEGORIES.filter((c) => cat.has(c)),
    sources: [...src].sort(),
    eventNames: [...evt].sort()
  };
}

/**
 * Attempts that were opened and never closed, across the records given.
 *
 * This is the query the whole standard was written for. An
 * `access_fix_requested` with no `access_fix_result` is a user who tried to fix
 * something and the app never told them whether it worked.
 */
export type UnfinishedAttempt = {
  attemptId: string;
  openedBy: string;
  sessionId: string | null;
  ts: string;
};

export function unfinishedAttempts(records: LogRecord[]): UnfinishedAttempt[] {
  const opened: Map<string, AttemptOpener> = new Map();
  const closed: Set<string> = new Set();

  for (const r of records) {
    if (!r.attemptId) continue;
    if (r.eventName && Object.prototype.hasOwnProperty.call(ATTEMPT_OPENERS, r.eventName)) {
      opened.set(r.attemptId, { openedBy: r.eventName, sessionId: r.sessionId ?? null, ts: r.ts });
    } else {
      closed.add(r.attemptId);
    }
  }

  return [...opened.entries()]
    .filter(([id]) => !closed.has(id))
    .map(([attemptId, info]) => ({ attemptId, ...info }))
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

type AttemptOpener = { openedBy: string; sessionId: string | null; ts: string };

/**
 * Events that open an attempt.
 *
 * Was hardcoded to one event, which meant adding a second pair in the catalog
 * silently did nothing here - the exact kind of drift the standard is against.
 */

export function describeLogFilter(filter: LogFilter = EMPTY_LOG_FILTER): string {
  const parts: string[] = [];
  if (filter.severities?.length) parts.push(`severity: ${filter.severities.join(", ")}`);
  if (filter.categories?.length) parts.push(`category: ${filter.categories.join(", ")}`);
  if (filter.source) parts.push(`source: ${filter.source}`);
  if (filter.actorCode) parts.push(`who: ${filter.actorCode}`);
  if (filter.requestId) parts.push(`request: ${filter.requestId}`);
  if (filter.eventNames?.length) parts.push(`event: ${filter.eventNames.join(", ")}`);
  if (filter.sessionId) parts.push(`session: ${filter.sessionId}`);
  if (filter.attemptId) parts.push(`attempt: ${filter.attemptId}`);
  if (filter.text?.trim()) parts.push(`text: "${filter.text.trim()}"`);
  if (filter.since) parts.push(`from ${filter.since}`);
  if (filter.until) parts.push(`to ${filter.until}`);
  return parts.length ? parts.join(" · ") : "no filter";
}

/**
 * The cutoff for a category, given its retention. Returns null when the
 * category is kept forever.
 */
export function retentionCutoff(
  category: LogCategory,
  days: number,
  now: Date = new Date()
): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Fold a stored retention override over the defaults. */
export function retentionFor(
  overrides: Partial<Record<LogCategory, number>> = {}
): Record<LogCategory, number> {
  const out: Record<LogCategory, number> = { ...DEFAULT_RETENTION_DAYS };
  for (const [key, value] of Object.entries(overrides)) {
    if (isLogCategory(key) && typeof value === "number" && value >= 0) out[key] = value;
  }
  return out;
}
