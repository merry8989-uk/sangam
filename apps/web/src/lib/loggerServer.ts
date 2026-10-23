import { prisma } from "./prisma";
import {
  appIdFromEnv,
  buildRecord,
  environmentFromEnv,
  errorMetadata,
  levelFromEnv,
  severityAtLeast,
  shouldSample,
  type LogCategory,
  type LogMetadata,
  type LogRecord,
  type LogSeverity
} from "./logger";
import { randomUUID } from "crypto";

/**
 * Where a log record goes.
 *
 * The rules this holds to:
 *
 *  - Logging never breaks the thing it is logging. Every path here is wrapped,
 *    and a failure to write is swallowed. A database outage must not turn a
 *    working request into a 500 because it could not write a line about it.
 *  - Records are batched. One INSERT per log line is a lot of round trips for
 *    something nobody is waiting on, so records collect and go in together.
 *  - The level gate is applied here rather than at the call site, so a caller
 *    can log a TRACE without wondering whether it is worth it.
 *
 * One honest limitation: the buffer is in-process. On a platform that freezes
 * or destroys an instance between requests - serverless - a batch that has not
 * flushed yet is lost. Set LOG_SYNC=true there, and every record is written
 * before the call returns.
 */

const FLUSH_SIZE = 50;
const FLUSH_MS = 1000;
const MAX_BUFFER = 500;

// A record plus the account it was about. The account is an internal link and
// deliberately not part of LogRecord, so it travels beside it rather than in it.
type Pending = { record: LogRecord; userId: string | null; session: Record<string, unknown> | null };

let buffer: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let writing = false;

function syncMode(): boolean {
  return (process.env.LOG_SYNC ?? "").trim().toLowerCase() === "true";
}

function consoleMode(): boolean {
  const raw = (process.env.LOG_CONSOLE ?? "").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  // In development, mirror to the console so a terminal shows what is happening.
  return (process.env.NODE_ENV ?? "development") !== "production";
}

type LogInput = {
  severity: LogSeverity;
  category: LogCategory;
  message: unknown;
  requestId?: string | null;
  actorCode?: string | null;
  source?: string | null;
  metadata?: LogMetadata;
  /** The account this was about, when there is one. */
  userId?: string | null;

  // ---- the event standard ----
  eventName?: string | null;
  schemaVersion?: string | null;
  sessionId?: string | null;
  attemptId?: string | null;
  /** Sent once per session, on session_start. */
  session?: Record<string, unknown> | null;
};

/** A request id, short enough to read out loud and unique enough to follow. */
export function newRequestId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Write one record.
 *
 * Fire and forget: returns immediately, never throws, and silently does nothing
 * when the level is below the configured floor.
 */
export function log(input: LogInput): void {
  try {
    if (!severityAtLeast(input.severity, levelFromEnv())) return;
    if (!shouldSample(input.severity, input.category, Math.random())) return;

    const record = buildRecord({
      severity: input.severity,
      category: input.category,
      message: input.message,
      appId: appIdFromEnv(),
      environment: environmentFromEnv(),
      requestId: input.requestId ?? null,
      actorCode: input.actorCode ?? null,
      source: input.source ?? null,
      eventName: input.eventName ?? null,
      schemaVersion: input.schemaVersion ?? null,
      sessionId: input.sessionId ?? null,
      attemptId: input.attemptId ?? null,
      metadata: input.metadata ?? {}
    });

    if (consoleMode()) {
      const line = `${record.ts} ${record.severity.padEnd(5)} ${record.category.padEnd(11)} ${record.message}`;
      if (record.severity === "ERROR" || record.severity === "FATAL") console.error(line);
      else if (record.severity === "WARN") console.warn(line);
      else console.log(line);
    }

    if (syncMode()) {
      void writeOne(record, input.userId ?? null, input.session ?? null);
      return;
    }
    buffer.push({ record, userId: input.userId ?? null, session: input.session ?? null });
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    schedule();
  } catch {
    /* logging must never break the caller */
  }
}

function toRow(record: LogRecord, userId: string | null, session: Record<string, unknown> | null) {
  return {
    ts: new Date(record.ts),
    severity: record.severity,
    category: record.category,
    message: record.message,
    appId: record.appId,
    environment: record.environment,
    requestId: record.requestId,
    actorCode: record.actorCode,
    source: record.source,
    eventName: record.eventName,
    schemaVersion: record.schemaVersion,
    sessionId: record.sessionId,
    attemptId: record.attemptId,
    session: (session ?? undefined) as object | undefined,
    metadata: record.metadata as object,
    userId
  };
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    void flush();
  }, FLUSH_MS);
  // Do not hold the process open for a log line.
  if (typeof timer.unref === "function") timer.unref();
}

async function writeOne(
  record: LogRecord,
  userId: string | null,
  session: Record<string, unknown> | null
): Promise<void> {
  try {
    await prisma.logEntry.create({ data: toRow(record, userId, session) });
  } catch {
    /* a lost log line is better than a broken request */
  }
}

/** Write everything buffered. Safe to call at any time, including on shutdown. */
export async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (writing || buffer.length === 0) return;
  writing = true;
  const batch = buffer;
  buffer = [];
  try {
    await prisma.logEntry.createMany({ data: batch.map((p) => toRow(p.record, p.userId, p.session)) });
  } catch {
    // Put them back once, so a transient failure does not lose the batch. If it
    // fails again they age out rather than growing without bound.
    buffer = [...batch, ...buffer].slice(-MAX_BUFFER);
  } finally {
    writing = false;
  }
}

// ---------------------------------------------------------------- shortcuts
// These exist so instrumentation is one line and always lands in the right
// category. Getting the category wrong is the easiest way to make a log useless.

/** Something ordinary the application did. */
export function logApp(message: string, metadata?: LogMetadata, requestId?: string | null): void {
  log({ severity: "INFO", category: "APPLICATION", message, metadata, requestId });
}

/** Something failed. Always kept - never sampled. */
export function logError(
  message: unknown,
  err?: unknown,
  extra?: LogMetadata & { requestId?: string | null; userId?: string | null; source?: string }
): void {
  const { requestId, userId, source, ...rest } = extra ?? {};
  log({
    severity: "ERROR",
    category: "ERROR",
    message,
    metadata: { ...(err !== undefined ? errorMetadata(err) : {}), ...rest },
    requestId: requestId ?? null,
    userId: userId ?? null,
    source: source ?? null
  });
}

/** A failed login, a refused permission, something that looks like an attack. */
export function logSecurity(
  message: string,
  metadata?: LogMetadata & { requestId?: string | null; userId?: string | null; source?: string }
): void {
  const { requestId, userId, source, ...rest } = metadata ?? {};
  log({
    severity: "WARN",
    category: "SECURITY",
    message,
    metadata: rest,
    requestId: requestId ?? null,
    userId: userId ?? null,
    source: source ?? null
  });
}

/** An authorised person changed a resource. Kept for a year, never sampled. */
export function logAudit(input: {
  actorCode?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  requestId?: string | null;
  metadata?: LogMetadata;
}): void {
  log({
    severity: "INFO",
    category: "AUDIT",
    message: `${input.action} ${input.resource}`,
    actorCode: input.actorCode ?? null,
    userId: input.userId ?? null,
    requestId: input.requestId ?? null,
    source: "audit",
    metadata: { action: input.action, resource: input.resource, resourceId: input.resourceId, ...input.metadata }
  });
}

/** How long something took. */
export function logPerformance(
  message: string,
  ms: number,
  metadata?: LogMetadata & { requestId?: string | null; source?: string }
): void {
  const { requestId, source, ...rest } = metadata ?? {};
  // Below a second is not worth a line unless something asks for it.
  const slow = ms >= 1000;
  log({
    severity: slow ? "WARN" : "DEBUG",
    category: "PERFORMANCE",
    message,
    metadata: { ms: Math.round(ms), ...rest },
    requestId: requestId ?? null,
    source: source ?? null
  });
}

/** A scheduled or background task. */
export function logJob(
  name: string,
  ok: boolean,
  metadata?: LogMetadata & { requestId?: string | null }
): void {
  const { requestId, ...rest } = metadata ?? {};
  log({
    severity: ok ? "INFO" : "ERROR",
    category: "JOB",
    message: `${name} ${ok ? "completed" : "failed"}`,
    metadata: { job: name, ok, ...rest },
    requestId: requestId ?? null,
    source: name
  });
}

/** A person did something. Sampled at half, because there are a lot of them. */
export function logActivity(
  action: string,
  metadata?: LogMetadata & { actorCode?: string | null; userId?: string | null; requestId?: string | null }
): void {
  const { actorCode, userId, requestId, ...rest } = metadata ?? {};
  log({
    severity: "INFO",
    category: "ACTIVITY",
    message: action,
    metadata: rest,
    actorCode: actorCode ?? null,
    userId: userId ?? null,
    requestId: requestId ?? null,
    source: "activity"
  });
}
