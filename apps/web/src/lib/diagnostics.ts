/**
 * Diagnostics.
 *
 * A user can send a technical report to support without typing anything. This
 * file holds the pure part: what a report contains, what must be stripped out
 * of it, and how it is written in each format.
 *
 * Kept free of framework imports so the redaction rules and every format can be
 * tested directly. The redaction is the part that matters most - a diagnostics
 * report travels over email and lands in a mailbox, so it must not carry
 * tokens, passwords or other people's addresses.
 */

/**
 * The report envelope is versioned. Bumping this is a breaking change to the
 * shape, and any consumer that parses a report should check it first.
 */
import { codeForReport } from "./userCode";

export const SCHEMA_VERSION = "1.0.0";

export const DIAG_FORMATS = ["md", "json", "txt", "csv"] as const;
export type DiagFormat = (typeof DIAG_FORMATS)[number];

export function isDiagFormat(v: unknown): v is DiagFormat {
  return typeof v === "string" && (DIAG_FORMATS as readonly string[]).includes(v);
}

export function formatLabel(f: DiagFormat): string {
  switch (f) {
    case "md":
      return "Markdown (.md)";
    case "json":
      return "JSON (.json)";
    case "txt":
      return "Plain text (.txt)";
    case "csv":
      return "Spreadsheet (.csv)";
    default:
      return f;
  }
}

export function formatHint(f: DiagFormat): string {
  switch (f) {
    case "md":
      return "Reads well in the email itself or on GitHub.";
    case "json":
      return "Everything, exactly as recorded. Best if support has to parse it.";
    case "txt":
      return "Opens anywhere, on any device.";
    case "csv":
      return "Opens in Excel and Google Sheets. One row per event.";
    default:
      return "";
  }
}

export function fileExtension(f: DiagFormat): string {
  return f;
}

export function mimeType(f: DiagFormat): string {
  switch (f) {
    case "md":
      return "text/markdown";
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    default:
      return "text/plain";
  }
}

export type DiagSeverity = "error" | "warn" | "info";

export type DiagEntry = {
  at: string;
  /** unhandled | console | request | route | note | env */
  kind: string;
  severity: DiagSeverity;
  message: string;
  /**
   * What happened, as distinct from what was attempted. A log full of requests
   * with no outcomes tells you someone was trying; it does not tell you whether
   * it worked.
   */
  outcome?: DiagOutcome;
  /** Ties this entry to the session it happened in. */
  sessionId?: string;
  detail?: Record<string, unknown>;
};

export type DiagOutcome = "success" | "failure" | "noop";

export type DiagClientInfo = {
  platform: string;
  appVersion: string;
  route: string;
  userAgent: string;
  language: string;
  timezone: string;
  screen: string;
  viewport: string;
  devicePixelRatio: number;
  online: boolean;
  /** Only present when the browser exposes it. */
  memoryMb?: number;
  connection?: string;
  startedAt: string;
};

export type DiagCheck = { name: string; ok: boolean; ms: number; note: string };

export type DiagServerInfo = {
  appVersion: string;
  nodeVersion: string;
  uptimeSec: number;
  env: string;
  checks: DiagCheck[];
  features: Record<string, string | boolean>;
};

export type DiagnosticReport = {
  id: string;
  schemaVersion: string;
  generatedAt: string;
  /** One id per page load / app launch, so a report can be tied to a session. */
  sessionId: string;
  platform: string;
  appVersion: string;
  signedIn: boolean;
  /**
   * The pseudonymous account code, and nothing else. The real account id is
   * deliberately not in the report: the logging standard this follows asks for
   * a pseudonymous identifier, and an id in a file that travels by email is
   * one more thing to leak.
   */
  userCode: string;
  client: DiagClientInfo | null;
  server: DiagServerInfo | null;
  entries: DiagEntry[];
  counts: Record<DiagSeverity, number>;
  /**
   * Set when the report was exported from a filtered view. Present so a reader
   * knows the report is a slice and not everything that was recorded.
   */
  filter?: DiagFilter;
};

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Keys whose value is never included, whatever it holds. */
const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|auth|credential|cookie|session|bearer|private[-_]?key|salt|signature|ndus|jstoken|csrf|otp/i;

/** A run of characters long enough to be a key, a token or a hash. */
const BLOB = /[A-Za-z0-9+/_=-]{24,}/g;

const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const BEARER = /\b(bearer|token|apikey|api_key|key)\s*[:=]?\s*[A-Za-z0-9._~+/=-]{8,}/gi;
/** Credentials inside a connection string: scheme://user:pass@host */
const URL_CREDS = /([a-z][a-z0-9+.-]*:\/\/)[^/\s@]*:[^/\s@]*@/gi;
/** Sensitive query parameters, in a URL or a body. */
const QUERY_SECRET = /([?&](?:token|key|secret|password|code|access_token|sig|signature)=)[^&\s]*/gi;
/** A phone number. */
const PHONE = /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/g;

export const REDACTED = "[redacted]";

/** Mask an address but keep enough to recognise it: a***@example.com */
function maskEmail(local: string, domain: string): string {
  const head = local.slice(0, 1) || "?";
  return `${head}***@${domain}`;
}

/**
 * Strip anything sensitive out of a free-text string.
 *
 * Ordered so that the specific patterns run before the generic blob rule -
 * otherwise a connection string would be mangled into something unreadable
 * before its password was removed.
 */
export function redactText(input: string, maxLength = 2000): string {
  let out = String(input ?? "");
  out = out.replace(URL_CREDS, `$1${REDACTED}@`);
  out = out.replace(BEARER, (m) => m.replace(/[A-Za-z0-9._~+/=-]{8,}$/, REDACTED));
  out = out.replace(QUERY_SECRET, `$1${REDACTED}`);
  out = out.replace(EMAIL, (_m, local: string, domain: string) => maskEmail(local, domain));
  out = out.replace(PHONE, "[number]");
  out = out.replace(BLOB, REDACTED);
  if (out.length > maxLength) out = out.slice(0, maxLength) + "…(truncated)";
  return out;
}

/** Redact a structured value, key by key. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value, 500);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function redactEntry(entry: DiagEntry): DiagEntry {
  return {
    at: entry.at,
    kind: entry.kind,
    severity: entry.severity,
    outcome: entry.outcome,
    sessionId: entry.sessionId,
    message: redactText(entry.message, 1000),
    detail: entry.detail ? (redactValue(entry.detail) as Record<string, unknown>) : undefined
  };
}

/** Cap the report so an export can never grow without bound. */
/**
 * Make room when the buffer is full.
 *
 * Errors are kept at full rate; everything else is the sampled part and is
 * dropped first. Only when there is nothing but errors left does the oldest
 * error go, so a burst of failures still cannot grow the buffer without bound.
 */
export function evictForCapacity(entries: DiagEntry[], max: number): DiagEntry[] {
  if (max <= 0) return [];
  if (entries.length <= max) return entries.slice();
  const out = entries.slice();
  while (out.length > max) {
    const idx = out.findIndex((e) => e.severity !== "error");
    out.splice(idx === -1 ? 0 : idx, 1);
  }
  return out;
}

/**
 * A filter over the recorded events.
 *
 * Every field is optional, and an absent field means "no opinion" rather than
 * "match nothing" - so an empty filter returns everything, which is what the
 * screen starts from.
 */
export type DiagFilter = {
  severities?: DiagSeverity[];
  kinds?: string[];
  outcomes?: DiagOutcome[];
  sessionId?: string;
  /** Case-insensitive substring, matched against the message. */
  text?: string;
  /** ISO timestamps. Inclusive. */
  since?: string;
  until?: string;
};

export const EMPTY_FILTER: DiagFilter = {};

function matchesList<T>(value: T | undefined, allowed: T[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return value !== undefined && allowed.includes(value);
}

/**
 * Apply a filter. Pure, and the only place the matching rules live, so the
 * screen, the export and the internal endpoint all agree on what a filter means.
 */
export function filterEntries(entries: DiagEntry[], filter: DiagFilter = EMPTY_FILTER): DiagEntry[] {
  const text = filter.text?.trim().toLowerCase();
  const since = filter.since ? Date.parse(filter.since) : NaN;
  const until = filter.until ? Date.parse(filter.until) : NaN;

  return entries.filter((e) => {
    if (!matchesList(e.severity, filter.severities)) return false;
    if (!matchesList(e.kind, filter.kinds)) return false;
    if (!matchesList(e.outcome, filter.outcomes)) return false;
    if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
    if (text) {
      const hay = `${e.message} ${detailText(e.detail)}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (!Number.isNaN(since) || !Number.isNaN(until)) {
      const at = Date.parse(e.at);
      if (Number.isNaN(at)) return false;
      if (!Number.isNaN(since) && at < since) return false;
      if (!Number.isNaN(until) && at > until) return false;
    }
    return true;
  });
}

/** Is anything actually being filtered out? Drives the "clear" affordance. */
export function filterIsActive(filter: DiagFilter = EMPTY_FILTER): boolean {
  return Boolean(
    filter.severities?.length ||
      filter.kinds?.length ||
      filter.outcomes?.length ||
      filter.sessionId ||
      filter.text?.trim() ||
      filter.since ||
      filter.until
  );
}

/** The values actually present, so the UI offers real choices rather than guesses. */
export function filterFacets(entries: DiagEntry[]): {
  severities: DiagSeverity[];
  kinds: string[];
  outcomes: DiagOutcome[];
  sessions: string[];
} {
  const severities = new Set<DiagSeverity>();
  const kinds = new Set<string>();
  const outcomes = new Set<DiagOutcome>();
  const sessions = new Set<string>();
  for (const e of entries) {
    severities.add(e.severity);
    kinds.add(e.kind);
    if (e.outcome) outcomes.add(e.outcome);
    if (e.sessionId) sessions.add(e.sessionId);
  }
  const order: DiagSeverity[] = ["error", "warn", "info"];
  return {
    severities: order.filter((s) => severities.has(s)),
    kinds: [...kinds].sort(),
    outcomes: (["failure", "success", "noop"] as DiagOutcome[]).filter((o) => outcomes.has(o)),
    sessions: [...sessions].sort()
  };
}

/** One line describing the filter, for an export header or a count. */
export function describeFilter(filter: DiagFilter = EMPTY_FILTER): string {
  const parts: string[] = [];
  if (filter.severities?.length) parts.push(`severity: ${filter.severities.join(", ")}`);
  if (filter.kinds?.length) parts.push(`kind: ${filter.kinds.join(", ")}`);
  if (filter.outcomes?.length) parts.push(`outcome: ${filter.outcomes.join(", ")}`);
  if (filter.sessionId) parts.push(`session: ${filter.sessionId}`);
  if (filter.text?.trim()) parts.push(`text: "${filter.text.trim()}"`);
  if (filter.since) parts.push(`from ${filter.since}`);
  if (filter.until) parts.push(`to ${filter.until}`);
  return parts.length ? parts.join(" · ") : "no filter";
}

/** Read a filter out of a URL, so a filtered view can be linked and bookmarked. */
export function filterFromParams(params: URLSearchParams): DiagFilter {
  const list = (key: string): string[] =>
    (params.get(key) ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  const severities = list("severity").filter((v): v is DiagSeverity =>
    v === "error" || v === "warn" || v === "info"
  );
  const outcomes = list("outcome").filter((v): v is DiagOutcome =>
    v === "success" || v === "failure" || v === "noop"
  );
  return {
    severities: severities.length ? severities : undefined,
    kinds: list("kind").length ? list("kind") : undefined,
    outcomes: outcomes.length ? outcomes : undefined,
    sessionId: params.get("session") ?? undefined,
    text: params.get("q") ?? undefined,
    since: params.get("since") ?? undefined,
    until: params.get("until") ?? undefined
  };
}

/** The reverse, so the current view can be put in the address bar. */
export function filterToParams(filter: DiagFilter): string {
  const p = new URLSearchParams();
  if (filter.severities?.length) p.set("severity", filter.severities.join(","));
  if (filter.kinds?.length) p.set("kind", filter.kinds.join(","));
  if (filter.outcomes?.length) p.set("outcome", filter.outcomes.join(","));
  if (filter.sessionId) p.set("session", filter.sessionId);
  if (filter.text?.trim()) p.set("q", filter.text.trim());
  if (filter.since) p.set("since", filter.since);
  if (filter.until) p.set("until", filter.until);
  return p.toString();
}

export const MAX_ENTRIES = 500;
export const MAX_ENTRY_LENGTH = 1000;

export function buildReport(input: {
  platform: string;
  appVersion: string;
  signedIn: boolean;
  userCode?: string | null;
  client?: DiagClientInfo | null;
  server?: DiagServerInfo | null;
  entries: DiagEntry[];
  sessionId?: string;
  filter?: DiagFilter;
  now?: Date;
  id?: string;
}): DiagnosticReport {
  const now = input.now ?? new Date();
  const entries = input.entries.slice(-MAX_ENTRIES).map(redactEntry);
  const counts: Record<DiagSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const e of entries) counts[e.severity] = (counts[e.severity] ?? 0) + 1;
  // Kept separate from severity: an info entry can still be a failure.

  const sessionId = input.sessionId ?? makeSessionId(now);
  // Stamp every entry with the session, so a report that spans two sessions is
  // still readable.
  const stamped = entries.map((e) => (e.sessionId ? e : { ...e, sessionId }));

  return {
    id: input.id ?? makeReportId(now),
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    sessionId,
    platform: input.platform,
    appVersion: input.appVersion,
    signedIn: input.signedIn,
    userCode: codeForReport(input.userCode),
    client: input.client ?? null,
    server: input.server ?? null,
    entries: stamped,
    counts,
    filter: input.filter && filterIsActive(input.filter) ? input.filter : undefined
  };
}

/** One id per page load. Short, and safe to put in a subject line. */
export function makeSessionId(now: Date = new Date(), random: number = Math.random()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(random * 1679616).toString(36).padStart(4, "0");
  return `sess_${stamp}_${suffix}`;
}

/** Short, sortable, and safe to put in a subject line. */
export function makeReportId(now: Date = new Date(), random: number = Math.random()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15); // YYYYMMDDTHHMMSS
  const suffix = Math.floor(random * 46656).toString(36).padStart(3, "0");
  return `${stamp}-${suffix}`;
}

export function reportFilename(report: DiagnosticReport, format: DiagFormat): string {
  return `sangam-diagnostics-${report.id}.${fileExtension(format)}`;
}

// ---------------------------------------------------------------------------
// Writing the report out
// ---------------------------------------------------------------------------

function envRows(report: DiagnosticReport): DiagEntry[] {
  const rows: DiagEntry[] = [
    { at: report.generatedAt, kind: "env", severity: "info", message: `report ${report.id}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `schema ${report.schemaVersion}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `session ${report.sessionId}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `app ${report.appVersion} (${report.platform})` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `signed in: ${report.signedIn}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `user code ${report.userCode}` }
  ];
  if (report.client) {
    const c = report.client;
    rows.push(
      { at: c.startedAt, kind: "env", severity: "info", message: `route ${c.route}` },
      { at: c.startedAt, kind: "env", severity: "info", message: `browser ${c.userAgent}` },
      { at: c.startedAt, kind: "env", severity: "info", message: `platform ${c.platform} | lang ${c.language} | tz ${c.timezone}` },
      { at: c.startedAt, kind: "env", severity: "info", message: `screen ${c.screen} | viewport ${c.viewport} | dpr ${c.devicePixelRatio}` },
      { at: c.startedAt, kind: "env", severity: "info", message: `online ${c.online}${c.connection ? ` | connection ${c.connection}` : ""}${c.memoryMb ? ` | memory ~${c.memoryMb} MB` : ""}` }
    );
  }
  if (report.server) {
    const s = report.server;
    rows.push(
      { at: report.generatedAt, kind: "env", severity: "info", message: `node ${s.nodeVersion} | env ${s.env} | uptime ${s.uptimeSec}s` },
      ...s.checks.map((k) => ({
        at: report.generatedAt,
        kind: "env",
        severity: (k.ok ? "info" : "warn") as DiagSeverity,
        message: `check ${k.name}: ${k.ok ? "ok" : "FAILED"} (${k.ms}ms)${k.note ? ` - ${k.note}` : ""}`
      })),
      ...Object.entries(s.features).map(([k, v]) => ({
        at: report.generatedAt,
        kind: "env",
        severity: "info" as DiagSeverity,
        message: `feature ${k} = ${v}`
      }))
    );
  }
  return rows;
}

function detailText(detail?: Record<string, unknown>): string {
  if (!detail || Object.keys(detail).length === 0) return "";
  try {
    return JSON.stringify(detail);
  } catch {
    return "[unserialisable]";
  }
}

export function formatReport(report: DiagnosticReport, format: DiagFormat): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  if (format === "csv") {
    // One consistent table, so Excel and Sheets open it without fixing anything.
    // Environment details are simply rows of kind `env`.
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [...envRows(report), ...report.entries];
    const lines = ["at,severity,kind,outcome,session,message,detail"];
    for (const r of rows) {
      lines.push([r.at, r.severity, r.kind, r.outcome ?? "", r.sessionId ?? "", esc(r.message), esc(detailText(r.detail))].join(","));
    }
    return lines.join("\n");
  }

  if (format === "txt") {
    const out: string[] = [];
    out.push("SANGAM DIAGNOSTICS");
    out.push("=".repeat(60));
    out.push(`report      ${report.id}`);
    out.push(`generated   ${report.generatedAt}`);
    out.push(`app         ${report.appVersion} (${report.platform})`);
    out.push(`signed in   ${report.signedIn}`);
    out.push(`events      ${report.entries.length}  (${report.counts.error} errors, ${report.counts.warn} warnings)`);
    out.push("");
    out.push("-- environment --");
    for (const r of envRows(report)) out.push(`  ${r.message}`);
    out.push("");
    out.push("-- events --");
    for (const e of report.entries) {
      const d = detailText(e.detail);
      out.push(
        `  [${e.at}] ${e.severity.toUpperCase().padEnd(5)} ${e.kind.padEnd(9)} ${(e.outcome ?? "-").padEnd(7)} ${e.message}${d ? `  ${d}` : ""}`
      );
    }
    if (!report.entries.length) out.push("  (nothing recorded)");
    return out.join("\n");
  }

  // markdown
  const out: string[] = [];
  out.push(`# Sangam diagnostics report`);
  out.push("");
  out.push(`| | |`);
  out.push(`|---|---|`);
  out.push(`| Report id | \`${report.id}\` |`);
  out.push(`| Schema | ${report.schemaVersion} |`);
  out.push(`| Session | \`${report.sessionId}\` |`);
  out.push(`| User code | \`${report.userCode}\` |`);
  out.push(`| Generated | ${report.generatedAt} |`);
  out.push(`| App | ${report.appVersion} (${report.platform}) |`);
  out.push(`| Signed in | ${report.signedIn} |`);
  out.push(`| Events | ${report.entries.length} |`);
  if (report.filter) out.push(`| Filter | ${describeFilter(report.filter)} |`);
  out.push(`| Errors | ${report.counts.error} |`);
  out.push(`| Warnings | ${report.counts.warn} |`);
  out.push("");
  out.push(`## Environment`);
  out.push("");
  for (const r of envRows(report)) out.push(`- ${r.message}`);
  out.push("");
  out.push(`## Events`);
  out.push("");
  if (!report.entries.length) {
    out.push("_Nothing recorded. That is itself useful: it means no error was captured._");
  } else {
    out.push("| Time | Severity | Kind | Outcome | Message |");
    out.push("|---|---|---|---|---|");
    for (const e of report.entries) {
      out.push(`| ${e.at} | ${e.severity} | ${e.kind} | ${e.outcome ?? "-"} | ${e.message.replace(/\|/g, "\\|")} |`);
    }
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Sending it
// ---------------------------------------------------------------------------

/** The few lines that go in the email body, so the user types almost nothing. */
export function summaryLines(report: DiagnosticReport, limit = 12): string[] {
  const lines: string[] = [];
  lines.push(`Report id : ${report.id}`);
  lines.push(`Schema    : ${report.schemaVersion}`);
  lines.push(`Session   : ${report.sessionId}`);
  lines.push(`User code : ${report.userCode}`);
  lines.push(`Generated : ${report.generatedAt}`);
  lines.push(`App       : ${report.appVersion} (${report.platform})`);
  if (report.client) {
    lines.push(`Route     : ${report.client.route}`);
    lines.push(`Device    : ${report.client.userAgent.slice(0, 110)}`);
  }
  lines.push(`Events    : ${report.entries.length} (${report.counts.error} errors, ${report.counts.warn} warnings)`);
  const worst = report.entries.filter((e) => e.severity === "error").slice(-limit);
  const shown = worst.length ? worst : report.entries.slice(-limit);
  if (shown.length) {
    lines.push("");
    lines.push(worst.length ? "Recent errors:" : "Recent events:");
    for (const e of shown) lines.push(`  [${e.at}] ${e.kind}: ${e.message.slice(0, 160)}`);
  }
  return lines;
}

/**
 * A Gmail compose URL, prefilled.
 *
 * Google accepts to / subject / body through the URL and nothing else - there is
 * no parameter for an attachment, in Gmail or in the mailto scheme. So this gets
 * the user to a filled-in compose window in one click, and the file has to be
 * attached by hand. When a real attachment is needed, the report goes through
 * the server instead (see lib/mailer.ts) or through the share sheet.
 */
export function buildGmailCompose(input: { to: string; subject: string; body: string }): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    tf: "1",
    to: input.to,
    su: input.subject,
    body: input.body
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * As much of the report as will fit in an email body.
 *
 * A mailto link and a Gmail compose URL cannot carry an attachment, so when the
 * report is not being sent by the server the logs have to travel in the body
 * itself. This puts in everything that fits rather than only a summary, so the
 * message is useful even if the user never attaches the file.
 */
export function fitReportInBody(
  report: DiagnosticReport,
  format: DiagFormat,
  limit: number
): { text: string; truncated: boolean } {
  const rendered = formatReport(report, format);
  if (rendered.length <= limit) return { text: rendered, truncated: false };
  // Cut on a line boundary so the tail is not half a line.
  const cut = rendered.slice(0, limit);
  const lastBreak = cut.lastIndexOf("\n");
  const text = (lastBreak > limit * 0.6 ? cut.slice(0, lastBreak) : cut) + "\n...(trimmed here)";
  return { text, truncated: true };
}

export const MAILTO_BODY_LIMIT = 1600;

export type MailtoInput = {
  to: string;
  report: DiagnosticReport;
  format: DiagFormat;
  filename: string;
  /** The user's own description of what went wrong, if they typed one. */
  note?: string;
};

/**
 * Build a `mailto:` link that opens the user's mail client with the subject and
 * body already filled in.
 *
 * A mailto link cannot carry an attachment, so the body says which file to
 * attach. The caller downloads that file at the same moment, so the user only
 * has to press attach - they never have to find, name or type anything.
 */
export function buildMailto(input: MailtoInput): string {
  const { report, format, filename } = input;
  const subject = `Sangam diagnostics ${report.id} - ${report.appVersion} - ${report.platform}`;

  const parts: string[] = [];
  parts.push("What went wrong (add one line here if you can):");
  parts.push(`> ${(input.note ?? "").trim() || ""}`);
  parts.push("");
  parts.push("--- summary ---");
  parts.push(...summaryLines(report));

  // The report itself, as far as it fits. A compose URL cannot carry a file, so
  // this is what makes the message worth reading on its own.
  const head = parts.join("\n");
  const room = MAILTO_BODY_LIMIT - head.length - 260;
  if (room > 200) {
    const fitted = fitReportInBody(report, format, room);
    parts.push("");
    parts.push(`--- report (${format}) ---`);
    parts.push(fitted.text);
    if (fitted.truncated) {
      parts.push("");
      parts.push("The report continues in the attached file.");
    }
  }

  parts.push("");
  parts.push("--- attachment ---");
  parts.push(`The full report has also been saved to your downloads as ${filename}.`);
  parts.push("Attach it if the text above was cut short.");

  let body = parts.join("\n");
  if (body.length > MAILTO_BODY_LIMIT + 400) {
    body = body.slice(0, MAILTO_BODY_LIMIT + 400) + "\n...(trimmed; the attachment has the rest)";
  }

  return `mailto:${encodeURIComponent(input.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** What the user is about to send, in plain words, so the choice is informed. */
export const DIAGNOSTICS_INCLUDES = [
  "App version, platform and the page you were on",
  "Browser, screen size, language and time zone",
  "Errors and failed requests recorded on this device",
  "Which server checks passed or failed",
  "Which features are switched on"
];

export const DIAGNOSTICS_EXCLUDES = [
  "Your password, session token or any API key",
  "The content of your posts, messages or comments",
  "Other people's names or email addresses",
  "Your email address - only your account id, and only if you are signed in"
];
