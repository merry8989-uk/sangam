/**
 * Writing a diagnostics report into Notion.
 *
 * Called after a report is stored, so support gets it in a place they already
 * look, with the fields as database properties they can filter and sort on
 * rather than as a wall of text.
 *
 * Plain `fetch` against the Notion REST API - no SDK, for the same reason the
 * mailer has no mail library: nothing to install, and the request body can be
 * built by a pure function and tested without a network.
 *
 * The whole thing is best effort. A report is already in our own database
 * before this runs, so a Notion outage must never lose it or fail the request.
 */

import type { DiagnosticReport } from "./diagnostics";
import { formatReport } from "./diagnostics";
import { codeForReport } from "./userCode";

export const NOTION_API = "https://api.notion.com/v1";
/** Pinned deliberately: Notion changes shapes between versions. */
export const NOTION_VERSION = "2022-06-28";

/** Notion rejects more than 100 blocks in one create call. */
export const MAX_BLOCKS = 90;
/** And caps a single rich-text block at 2000 characters. */
export const MAX_BLOCK_TEXT = 1900;

export type NotionConfig = {
  token: string;
  /** Prefer the data source id when the database has one. */
  databaseId?: string;
  dataSourceId?: string;
  /** Overrides the status a new row starts in. */
  status?: string;
};

export function notionConfig(): NotionConfig | null {
  const token = (process.env.NOTION_TOKEN ?? "").trim();
  const databaseId = (process.env.NOTION_DATABASE_ID ?? "").trim() || undefined;
  const dataSourceId = (process.env.NOTION_DATA_SOURCE_ID ?? "").trim() || undefined;
  if (!token || (!databaseId && !dataSourceId)) return null;
  return { token, databaseId, dataSourceId, status: (process.env.NOTION_STATUS ?? "").trim() || "New" };
}

export function notionConfigured(): boolean {
  return notionConfig() !== null;
}

type RichText = { type: "text"; text: { content: string } };
const rt = (content: string): RichText[] => [
  { type: "text", text: { content: content.slice(0, MAX_BLOCK_TEXT) } }
];

/** A one-line title that sorts by time and identifies the account. */
export function reportTitle(report: DiagnosticReport, code: string): string {
  const worst = report.counts.error > 0 ? `${report.counts.error} errors` : "no errors";
  return `${report.generatedAt.slice(0, 16).replace("T", " ")} · ${code} · ${worst}`;
}

/**
 * Build the page Notion should create.
 *
 * Pure: given a report it always produces the same body, which is what makes
 * the property mapping testable without touching the API.
 */
export function buildNotionPage(
  report: DiagnosticReport,
  opts: { code?: string | null; note?: string; deliveredBy?: string; status?: string } = {}
): Record<string, unknown> {
  const code = codeForReport(opts.code);
  const status = opts.status ?? "New";

  const properties: Record<string, unknown> = {
    Report: { title: rt(reportTitle(report, code)) },
    "Report ID": { rich_text: rt(report.id) },
    "User Code": { rich_text: rt(code) },
    Platform: { select: { name: report.platform } },
    "App Version": { rich_text: rt(report.appVersion) },
    Route: { rich_text: rt(report.client?.route ?? "") },
    Session: { rich_text: rt(report.sessionId) },
    Schema: { rich_text: rt(report.schemaVersion) },
    Events: { number: report.entries.length },
    Errors: { number: report.counts.error },
    Warnings: { number: report.counts.warn },
    Received: { date: { start: report.generatedAt } },
    Status: { status: { name: status } },
    Note: { rich_text: rt(opts.note ?? "") }
  };
  if (opts.deliveredBy) properties["Delivered By"] = { select: { name: opts.deliveredBy } };

  const children: Record<string, unknown>[] = [];
  const h2 = (text: string) => children.push({ object: "block", type: "heading_2", heading_2: { rich_text: rt(text) } });
  const para = (text: string) => children.push({ object: "block", type: "paragraph", paragraph: { rich_text: rt(text) } });
  const bullet = (text: string) =>
    children.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(text) } });

  // A short read first, so someone opening the row knows what they are looking at.
  para(
    report.counts.error > 0
      ? `${report.counts.error} error${report.counts.error === 1 ? "" : "s"} and ${report.counts.warn} warning${report.counts.warn === 1 ? "" : "s"} in ${report.entries.length} recorded events.`
      : `No errors recorded, in ${report.entries.length} events.`
  );
  if (opts.note?.trim()) {
    h2("What the user said");
    para(opts.note.trim());
  }

  h2("Where it happened");
  bullet(`Platform: ${report.platform}`);
  bullet(`App version: ${report.appVersion}`);
  if (report.client?.route) bullet(`Route: ${report.client.route}`);
  bullet(`Session: ${report.sessionId}`);
  bullet(`Report: ${report.id} (schema ${report.schemaVersion})`);
  if (report.client) {
    bullet(`Browser: ${report.client.userAgent}`);
    bullet(`Screen: ${report.client.screen} · viewport ${report.client.viewport} · dpr ${report.client.devicePixelRatio}`);
    bullet(`Language: ${report.client.language} · timezone: ${report.client.timezone} · online: ${report.client.online}`);
  }

  if (report.server) {
    h2("Server at the time");
    bullet(`Node ${report.server.nodeVersion} · ${report.server.env} · up ${report.server.uptimeSec}s`);
    for (const check of report.server.checks) {
      bullet(`${check.name}: ${check.ok ? "ok" : "FAILED"} (${check.ms}ms)`);
    }
    const on = Object.entries(report.server.features).filter(([, v]) => v === true || (typeof v === "string" && v));
    if (on.length) bullet(`Features on: ${on.map(([k]) => k).join(", ")}`);
  }

  h2("Errors");
  const errors = report.entries.filter((e) => e.severity === "error").slice(-15);
  if (!errors.length) {
    para("None recorded.");
  } else {
    for (const e of errors) {
      bullet(`${e.at} · ${e.kind}${e.outcome ? ` · ${e.outcome}` : ""} · ${e.message}`);
    }
    if (report.counts.error > errors.length) {
      para(`(${report.counts.error - errors.length} more in the full report below.)`);
    }
  }

  // The complete report, chunked. Code blocks, so it stays copy-pasteable.
  h2("Full report");
  const raw = formatReport(report, "json");
  for (let i = 0; i < raw.length && children.length < MAX_BLOCKS; i += MAX_BLOCK_TEXT) {
    children.push({
      object: "block",
      type: "code",
      code: { rich_text: rt(raw.slice(i, i + MAX_BLOCK_TEXT)), language: "json" }
    });
  }

  // No parent here: how the database is addressed is the caller's business,
  // and withParent() fills it in.
  return {
    properties,
    children: children.slice(0, MAX_BLOCKS)
  };
}

/** Fill in the parent, which depends on how the database is addressed. */
export function withParent(
  page: Record<string, unknown>,
  cfg: NotionConfig
): Record<string, unknown> {
  if (cfg.dataSourceId) {
    return { ...page, parent: { type: "data_source_id", data_source_id: cfg.dataSourceId } };
  }
  return { ...page, parent: { database_id: cfg.databaseId } };
}

export type NotionResult = { ok: boolean; url?: string; detail: string };

/** Create the row. Best effort: never throws, always reports what happened. */
export async function createNotionPage(
  report: DiagnosticReport,
  opts: { code?: string | null; note?: string; deliveredBy?: string } = {}
): Promise<NotionResult> {
  const cfg = notionConfig();
  if (!cfg) return { ok: false, detail: "notion not configured" };

  const page = withParent(buildNotionPage(report, { ...opts, status: cfg.status }), cfg);

  try {
    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION
      },
      body: JSON.stringify(page)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { url?: string };
    return { ok: true, url: data.url, detail: "created" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "request failed" };
  }
}
