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
  detail?: Record<string, unknown>;
};

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
  generatedAt: string;
  platform: string;
  appVersion: string;
  signedIn: boolean;
  /** The user's own id. Never an email address. */
  userId: string | null;
  client: DiagClientInfo | null;
  server: DiagServerInfo | null;
  entries: DiagEntry[];
  counts: Record<DiagSeverity, number>;
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
    message: redactText(entry.message, 1000),
    detail: entry.detail ? (redactValue(entry.detail) as Record<string, unknown>) : undefined
  };
}

/** Cap the report so an export can never grow without bound. */
export const MAX_ENTRIES = 500;
export const MAX_ENTRY_LENGTH = 1000;

export function buildReport(input: {
  platform: string;
  appVersion: string;
  signedIn: boolean;
  userId?: string | null;
  client?: DiagClientInfo | null;
  server?: DiagServerInfo | null;
  entries: DiagEntry[];
  now?: Date;
  id?: string;
}): DiagnosticReport {
  const now = input.now ?? new Date();
  const entries = input.entries.slice(-MAX_ENTRIES).map(redactEntry);
  const counts: Record<DiagSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const e of entries) counts[e.severity] = (counts[e.severity] ?? 0) + 1;

  return {
    id: input.id ?? makeReportId(now),
    generatedAt: now.toISOString(),
    platform: input.platform,
    appVersion: input.appVersion,
    signedIn: input.signedIn,
    userId: input.userId ?? null,
    client: input.client ?? null,
    server: input.server ?? null,
    entries,
    counts
  };
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
    { at: report.generatedAt, kind: "env", severity: "info", message: `app ${report.appVersion} (${report.platform})` },
    { at: report.generatedAt, kind: "env", severity: "info", message: `signed in: ${report.signedIn}` }
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
    const lines = ["at,severity,kind,message,detail"];
    for (const r of rows) {
      lines.push([r.at, r.severity, r.kind, esc(r.message), esc(detailText(r.detail))].join(","));
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
      out.push(`  [${e.at}] ${e.severity.toUpperCase().padEnd(5)} ${e.kind.padEnd(9)} ${e.message}${d ? `  ${d}` : ""}`);
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
  out.push(`| Generated | ${report.generatedAt} |`);
  out.push(`| App | ${report.appVersion} (${report.platform}) |`);
  out.push(`| Signed in | ${report.signedIn} |`);
  out.push(`| Events | ${report.entries.length} |`);
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
    out.push("| Time | Severity | Kind | Message |");
    out.push("|---|---|---|---|");
    for (const e of report.entries) {
      out.push(`| ${e.at} | ${e.severity} | ${e.kind} | ${e.message.replace(/\|/g, "\\|")} |`);
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
  parts.push("");
  parts.push("--- attachment ---");
  parts.push(`The full report has been saved to your downloads as:`);
  parts.push(`  ${filename}`);
  parts.push(`Please attach it to this email before sending.`);
  parts.push("");
  parts.push("You do not need to add anything else.");

  let body = parts.join("\n");
  if (body.length > MAILTO_BODY_LIMIT) {
    body = body.slice(0, MAILTO_BODY_LIMIT) + "\n...(trimmed; the attachment has the rest)";
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
