/**
 * Diagnostics, for the mobile app.
 *
 * Mirrors apps/web/src/lib/diagnostics.ts: same formats, same redaction rules,
 * same email shape. Slimmer, because the device half is much smaller on a
 * phone, but the parts that decide what leaves the device - redaction and the
 * email body - are the same.
 *
 * Duplicated rather than shared: the two apps are separate packages with no
 * shared build step. Keep them in step when you change one.
 */

/** Versioned envelope. Bumping this is a breaking change to the shape. */
export const SCHEMA_VERSION = "1.0.0";

export const DIAG_FORMATS = ["md", "json", "txt", "csv"] as const;
export type DiagFormat = (typeof DIAG_FORMATS)[number];

export function formatLabel(f: DiagFormat): string {
  if (f === "md") return "Markdown (.md)";
  if (f === "json") return "JSON (.json)";
  if (f === "txt") return "Plain text (.txt)";
  return "Spreadsheet (.csv)";
}

export function formatHint(f: DiagFormat): string {
  if (f === "md") return "Reads well in the email itself.";
  if (f === "json") return "Everything, exactly as recorded.";
  if (f === "txt") return "Opens anywhere.";
  return "Opens in Excel and Google Sheets.";
}

export function mimeType(f: DiagFormat): string {
  if (f === "md") return "text/markdown";
  if (f === "json") return "application/json";
  if (f === "csv") return "text/csv";
  return "text/plain";
}

export function isDiagFormat(v: unknown): v is DiagFormat {
  return typeof v === "string" && (DIAG_FORMATS as readonly string[]).includes(v);
}

export type DiagSeverity = "error" | "warn" | "info";

export type DiagOutcome = "success" | "failure" | "noop";

export type DiagEntry = {
  at: string;
  kind: string;
  severity: DiagSeverity;
  /** What happened, as distinct from what was attempted. */
  outcome?: DiagOutcome;
  /** Ties this entry to the session it happened in. */
  sessionId?: string;
  message: string;
  detail?: Record<string, unknown>;
};

export type DiagDeviceInfo = {
  platform: string;
  appVersion: string;
  route: string;
  osName: string;
  osVersion: string;
  deviceName: string;
  appOwnership: string;
  expoVersion: string;
  screen: string;
  timezone: string;
  online: boolean;
  startedAt: string;
};

export type DiagServerInfo = {
  appVersion: string;
  nodeVersion: string;
  uptimeSec: number;
  env: string;
  checks: { name: string; ok: boolean; ms: number; note: string }[];
  features: Record<string, string | boolean>;
};

export type DiagnosticReport = {
  id: string;
  schemaVersion: string;
  generatedAt: string;
  sessionId: string;
  platform: string;
  appVersion: string;
  signedIn: boolean;
  /** The pseudonymous account code. The real id is deliberately not included. */
  userCode: string;
  device: DiagDeviceInfo | null;
  server: DiagServerInfo | null;
  entries: DiagEntry[];
  counts: Record<DiagSeverity, number>;
  /** Set when exported from a filtered view. */
  filter?: DiagFilter;
};

export const REDACTED = "[redacted]";

const SECRET_KEY =
  /pass(word)?|secret|token|api[-_]?key|auth|credential|cookie|session|bearer|private[-_]?key|salt|signature|ndus|jstoken|csrf|otp/i;
const BLOB = /[A-Za-z0-9+/_=-]{24,}/g;
const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const BEARER = /\b(bearer|token|apikey|api_key|key)\s*[:=]?\s*[A-Za-z0-9._~+/=-]{8,}/gi;
const URL_CREDS = /([a-z][a-z0-9+.-]*:\/\/)[^/\s@]*:[^/\s@]*@/gi;
const QUERY_SECRET = /([?&](?:token|key|secret|password|code|access_token|sig|signature)=)[^&\s]*/gi;
const PHONE = /(?:\+91[\s-]?)?\b[6-9]\d{9}\b/g;

export function redactText(input: string, maxLength = 2000): string {
  let out = String(input ?? "");
  out = out.replace(URL_CREDS, `$1${REDACTED}@`);
  out = out.replace(BEARER, (m) => m.replace(/[A-Za-z0-9._~+/=-]{8,}$/, REDACTED));
  out = out.replace(QUERY_SECRET, `$1${REDACTED}`);
  out = out.replace(EMAIL, (_m, local: string, domain: string) => `${local.slice(0, 1) || "?"}***@${domain}`);
  out = out.replace(PHONE, "[number]");
  out = out.replace(BLOB, REDACTED);
  if (out.length > maxLength) out = out.slice(0, maxLength) + "…(truncated)";
  return out;
}

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

/** A code that is not a code, for a report sent with no account. */
export const ANONYMOUS_CODE = "SG-ANON";

/** The code to put in a report, or the anonymous label. */
export function codeForReport(code: string | null | undefined): string {
  return code && /^SG-[0-9A-Z]{6}$/.test(code) ? code : ANONYMOUS_CODE;
}

/** A filter over the recorded events. An absent field means "no opinion". */
export type DiagFilter = {
  severities?: DiagSeverity[];
  kinds?: string[];
  outcomes?: DiagOutcome[];
  sessionId?: string;
  text?: string;
  since?: string;
  until?: string;
};

export const EMPTY_FILTER: DiagFilter = {};

function matchesList<T>(value: T | undefined, allowed: T[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  return value !== undefined && allowed.includes(value);
}

/** Apply a filter. The only place the matching rules live. */
export function filterEntries(entries: DiagEntry[], filter: DiagFilter = EMPTY_FILTER): DiagEntry[] {
  const text = filter.text?.trim().toLowerCase();
  const since = filter.since ? Date.parse(filter.since) : NaN;
  const until = filter.until ? Date.parse(filter.until) : NaN;
  return entries.filter((e) => {
    if (!matchesList(e.severity, filter.severities)) return false;
    if (!matchesList(e.kind, filter.kinds)) return false;
    if (!matchesList(e.outcome, filter.outcomes)) return false;
    if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
    if (text && !`${e.message} ${detailText(e.detail)}`.toLowerCase().includes(text)) return false;
    if (!Number.isNaN(since) || !Number.isNaN(until)) {
      const at = Date.parse(e.at);
      if (Number.isNaN(at)) return false;
      if (!Number.isNaN(since) && at < since) return false;
      if (!Number.isNaN(until) && at > until) return false;
    }
    return true;
  });
}

export function filterIsActive(filter: DiagFilter = EMPTY_FILTER): boolean {
  return Boolean(
    filter.severities?.length || filter.kinds?.length || filter.outcomes?.length ||
      filter.sessionId || filter.text?.trim() || filter.since || filter.until
  );
}

/** The values actually present, so the UI offers real choices. */
export function filterFacets(entries: DiagEntry[]): {
  severities: DiagSeverity[];
  kinds: string[];
  outcomes: DiagOutcome[];
  sessions: string[];
} {
  const sev = new Set<DiagSeverity>();
  const kinds = new Set<string>();
  const outs = new Set<DiagOutcome>();
  const sessions = new Set<string>();
  for (const e of entries) {
    sev.add(e.severity);
    kinds.add(e.kind);
    if (e.outcome) outs.add(e.outcome);
    if (e.sessionId) sessions.add(e.sessionId);
  }
  const order: DiagSeverity[] = ["error", "warn", "info"];
  return {
    severities: order.filter((x) => sev.has(x)),
    kinds: [...kinds].sort(),
    outcomes: (["failure", "success", "noop"] as DiagOutcome[]).filter((x) => outs.has(x)),
    sessions: [...sessions].sort()
  };
}

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

export const MAX_ENTRIES = 500;

export function buildReport(input: {
  appVersion: string;
  signedIn: boolean;
  userCode?: string | null;
  device?: DiagDeviceInfo | null;
  server?: DiagServerInfo | null;
  entries: DiagEntry[];
  sessionId?: string;
  filter?: DiagFilter;
  now?: Date;
}): DiagnosticReport {
  const now = input.now ?? new Date();
  const entries = input.entries.slice(-MAX_ENTRIES).map(redactEntry);
  const counts: Record<DiagSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const e of entries) counts[e.severity] = (counts[e.severity] ?? 0) + 1;
  const sessionId = input.sessionId ?? makeSessionId(now);
  const stamped = entries.map((e) => (e.sessionId ? e : { ...e, sessionId }));
  return {
    id: makeReportId(now),
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    sessionId,
    platform: "android",
    appVersion: input.appVersion,
    signedIn: input.signedIn,
    userCode: codeForReport(input.userCode),
    device: input.device ?? null,
    server: input.server ?? null,
    entries: stamped,
    counts,
    filter: input.filter && filterIsActive(input.filter) ? input.filter : undefined
  };
}

/** One id per app launch. */
export function makeSessionId(now: Date = new Date(), random: number = Math.random()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(random * 1679616).toString(36).padStart(4, "0");
  return `sess_${stamp}_${suffix}`;
}

export function makeReportId(now: Date = new Date(), random: number = Math.random()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const suffix = Math.floor(random * 46656).toString(36).padStart(3, "0");
  return `${stamp}-${suffix}`;
}

export function reportFilename(report: DiagnosticReport, format: DiagFormat): string {
  return `sangam-diagnostics-${report.id}.${format}`;
}

function deviceRows(report: DiagnosticReport): DiagEntry[] {
  const rows: DiagEntry[] = [
    { at: report.generatedAt, kind: "env", severity: "info", message: `report ${report.id}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `schema ${report.schemaVersion}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `session ${report.sessionId}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `app ${report.appVersion} (${report.platform})` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `signed in: ${report.signedIn}` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `user code ${report.userCode}` }
  ];
  const d = report.device;
  if (d) {
    rows.push(
      { at: d.startedAt, kind: "env", severity: "info", message: `route ${d.route}` },
      { at: d.startedAt, kind: "env", severity: "info", message: `os ${d.osName} ${d.osVersion} | device ${d.deviceName}` },
      { at: d.startedAt, kind: "env", severity: "info", message: `expo ${d.expoVersion} | ownership ${d.appOwnership}` },
      { at: d.startedAt, kind: "env", severity: "info", message: `screen ${d.screen} | tz ${d.timezone} | online ${d.online}` }
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
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = ["at,severity,kind,outcome,session,message,detail"];
    for (const r of [...deviceRows(report), ...report.entries]) {
      lines.push([r.at, r.severity, r.kind, r.outcome ?? "", r.sessionId ?? "", esc(r.message), esc(detailText(r.detail))].join(","));
    }
    return lines.join("\n");
  }

  if (format === "txt") {
    const out: string[] = ["SANGAM DIAGNOSTICS", "=".repeat(60)];
    out.push(`report      ${report.id}`);
    out.push(`generated   ${report.generatedAt}`);
    out.push(`app         ${report.appVersion} (${report.platform})`);
    out.push(`signed in   ${report.signedIn}`);
    out.push(`events      ${report.entries.length}  (${report.counts.error} errors, ${report.counts.warn} warnings)`);
    out.push("", "-- environment --");
    for (const r of deviceRows(report)) out.push(`  ${r.message}`);
    out.push("", "-- events --");
    for (const e of report.entries) {
      const d = detailText(e.detail);
      out.push(
        `  [${e.at}] ${e.severity.toUpperCase().padEnd(5)} ${e.kind.padEnd(9)} ${(e.outcome ?? "-").padEnd(7)} ${e.message}${d ? `  ${d}` : ""}`
      );
    }
    if (!report.entries.length) out.push("  (nothing recorded)");
    return out.join("\n");
  }

  const out: string[] = ["# Sangam diagnostics report", ""];
  out.push(`| | |`, `|---|---|`);
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
  out.push("", "## Environment", "");
  for (const r of deviceRows(report)) out.push(`- ${r.message}`);
  out.push("", "## Events", "");
  if (!report.entries.length)
    out.push("_Nothing recorded. That is itself useful: it means no error was captured._");
  else {
    out.push("| Time | Severity | Kind | Outcome | Message |", "|---|---|---|---|---|");
    for (const e of report.entries)
      out.push(`| ${e.at} | ${e.severity} | ${e.kind} | ${e.outcome ?? "-"} | ${e.message.replace(/\|/g, "\\|")} |`);
  }
  return out.join("\n");
}

export function summaryLines(report: DiagnosticReport, limit = 12): string[] {
  const lines: string[] = [];
  lines.push(`Report id : ${report.id}`);
  lines.push(`Schema    : ${report.schemaVersion}`);
  lines.push(`Session   : ${report.sessionId}`);
  lines.push(`User code : ${report.userCode}`);
  lines.push(`Generated : ${report.generatedAt}`);
  lines.push(`App       : ${report.appVersion} (${report.platform})`);
  if (report.device) {
    lines.push(`Route     : ${report.device.route}`);
    lines.push(`Device    : ${report.device.deviceName} | ${report.device.osName} ${report.device.osVersion}`);
  }
  lines.push(`Events    : ${report.entries.length} (${report.counts.error} errors, ${report.counts.warn} warnings)`);
  const worst = report.entries.filter((e) => e.severity === "error").slice(-limit);
  const shown = worst.length ? worst : report.entries.slice(-limit);
  if (shown.length) {
    lines.push("", worst.length ? "Recent errors:" : "Recent events:");
    for (const e of shown) lines.push(`  [${e.at}] ${e.kind}: ${e.message.slice(0, 160)}`);
  }
  return lines;
}

/**
 * As much of the report as will fit in an email body.
 *
 * A mailto link cannot carry an attachment, so when the report is not sent by
 * the server the logs have to travel in the body itself.
 */
export function fitReportInBody(
  report: DiagnosticReport,
  format: DiagFormat,
  limit: number
): { text: string; truncated: boolean } {
  const rendered = formatReport(report, format);
  if (rendered.length <= limit) return { text: rendered, truncated: false };
  const cut = rendered.slice(0, limit);
  const lastBreak = cut.lastIndexOf("\n");
  const text = (lastBreak > limit * 0.6 ? cut.slice(0, lastBreak) : cut) + "\n...(trimmed here)";
  return { text, truncated: true };
}

export const MAILTO_BODY_LIMIT = 1600;

export function buildMailto(input: {
  to: string;
  report: DiagnosticReport;
  format: DiagFormat;
  filename: string;
  note?: string;
}): string {
  const { report, filename } = input;
  const subject = `Sangam diagnostics ${report.id} - ${report.appVersion} - ${report.platform}`;
  const parts: string[] = [];
  parts.push("What went wrong (add one line here if you can):");
  parts.push(`> ${(input.note ?? "").trim() || ""}`);
  parts.push("", "--- summary ---");
  parts.push(...summaryLines(report));

  const head = parts.join("\n");
  const room = MAILTO_BODY_LIMIT - head.length - 260;
  if (room > 200) {
    const fitted = fitReportInBody(report, input.format, room);
    parts.push("", `--- report (${input.format}) ---`);
    parts.push(fitted.text);
    if (fitted.truncated) parts.push("", "The report continues in the saved file.");
  }
  parts.push("", "--- file ---");
  parts.push(`Also saved on your device as ${filename}.`);
  let body = parts.join("\n");
  if (body.length > MAILTO_BODY_LIMIT + 400) body = body.slice(0, MAILTO_BODY_LIMIT + 400) + "\n...(trimmed)";
  return `mailto:${encodeURIComponent(input.to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const DIAGNOSTICS_INCLUDES = [
  "App version, phone model and Android version",
  "The screen you were on",
  "Errors and failed requests recorded on this device",
  "Which server checks passed or failed"
];

export const DIAGNOSTICS_EXCLUDES = [
  "Your password, session token or any API key",
  "The content of your posts, messages or comments",
  "Other people's names or email addresses",
  "Your email address - only your account id, and only if you are signed in"
];
