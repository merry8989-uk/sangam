import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { denyNonOperator } from "@/lib/admin";
import { logAudit } from "@/lib/loggerServer";
import {
  LOG_CATEGORIES,
  LOG_SEVERITIES,
  describeLogFilter,
  filterRecords,
  logFacets,
  retentionFor,
  unfinishedAttempts,
  type LogCategory,
  type LogFilter,
  type LogRecord,
  type LogSeverity
} from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Read the logs. Operators only.
 *
 *   GET    ?severity=&category=&source=&actor=&request=&q=&since=&until=&limit=&format=
 *   DELETE ?before=<iso>          delete everything older than a date
 *
 * The list is capped and the filter is applied in the database where it can be,
 * then in memory for the free-text part, which cannot be indexed. An export
 * reuses exactly the same filter, so what is downloaded is what is on screen.
 */

const MAX_LIMIT = 500;
const EXPORT_LIMIT = 5000;

function pick(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v && v.trim() ? v.trim() : undefined;
}

function filterFrom(params: URLSearchParams): LogFilter {
  const list = (key: string) => (pick(params, key) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const severities = list("severity").filter((v): v is LogSeverity =>
    (LOG_SEVERITIES as readonly string[]).includes(v)
  );
  const categories = list("category").filter((v): v is LogCategory =>
    (LOG_CATEGORIES as readonly string[]).includes(v)
  );
  return {
    severities: severities.length ? severities : undefined,
    categories: categories.length ? categories : undefined,
    source: pick(params, "source"),
    actorCode: pick(params, "actor"),
    requestId: pick(params, "request"),
    eventNames: list("event").length ? list("event") : undefined,
    sessionId: pick(params, "session"),
    attemptId: pick(params, "attempt"),
    text: pick(params, "q"),
    since: pick(params, "since"),
    until: pick(params, "until")
  };
}

function toRecord(row: {
  ts: Date;
  severity: string;
  category: string;
  message: string;
  appId: string;
  environment: string;
  requestId: string | null;
  actorCode: string | null;
  source: string | null;
  eventName: string | null;
  schemaVersion: string | null;
  sessionId: string | null;
  attemptId: string | null;
  metadata: unknown;
}): LogRecord {
  return {
    ts: row.ts.toISOString(),
    severity: row.severity as LogSeverity,
    category: row.category as LogCategory,
    message: row.message,
    appId: row.appId,
    environment: row.environment,
    requestId: row.requestId,
    actorCode: row.actorCode,
    source: row.source,
    eventName: row.eventName,
    schemaVersion: row.schemaVersion,
    sessionId: row.sessionId,
    attemptId: row.attemptId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>
  };
}

function render(records: LogRecord[], format: string, filter: LogFilter): string {
  const header = `# Sangam logs\n# filter: ${describeLogFilter(filter)}\n# count: ${records.length}\n`;

  if (format === "json") {
    return JSON.stringify({ filter, count: records.length, records }, null, 2);
  }

  if (format === "csv") {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      "ts,severity,category,eventName,attemptId,sessionId,app,environment,requestId,actorCode,source,message,metadata"
    ];
    for (const r of records) {
      lines.push(
        [
          r.ts, r.severity, r.category, r.eventName ?? "", r.attemptId ?? "", r.sessionId ?? "",
          r.appId, r.environment,
          r.requestId ?? "", r.actorCode ?? "", r.source ?? "",
          esc(r.message), esc(JSON.stringify(r.metadata))
        ].join(",")
      );
    }
    return lines.join("\n");
  }

  // plain text
  const lines = [header];
  for (const r of records) {
    const meta = Object.keys(r.metadata).length ? ` ${JSON.stringify(r.metadata)}` : "";
    lines.push(
      `${r.ts} ${r.severity.padEnd(5)} ${r.category.padEnd(11)} ${r.appId} ` +
        `${r.requestId ? `req=${r.requestId.slice(0, 8)} ` : ""}${r.source ? `src=${r.source} ` : ""}` +
        `${r.actorCode ? `who=${r.actorCode} ` : ""}${r.message}${meta}`
    );
  }
  return lines.join("\n");
}

export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await denyNonOperator(userId, "logs:read")).denied) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const filter = filterFrom(params);
  const format = pick(params, "format") ?? "json";
  const wantExport = ["csv", "txt", "json"].includes(format) && params.get("export") === "1";
  const limit = wantExport
    ? EXPORT_LIMIT
    : Math.min(Math.max(Number(params.get("limit") ?? 200) || 200, 1), MAX_LIMIT);

  // Push what the database can do into the query; the free-text part is applied
  // afterwards, because a substring search over metadata cannot be indexed.
  const rows = await prisma.logEntry.findMany({
    where: {
      ...(filter.severities?.length ? { severity: { in: filter.severities } } : {}),
      ...(filter.categories?.length ? { category: { in: filter.categories } } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.actorCode ? { actorCode: filter.actorCode } : {}),
      ...(filter.requestId ? { requestId: filter.requestId } : {}),
      ...(filter.eventNames?.length ? { eventName: { in: filter.eventNames } } : {}),
      ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
      ...(filter.attemptId ? { attemptId: filter.attemptId } : {}),
      ...(filter.since || filter.until
        ? {
            ts: {
              ...(filter.since ? { gte: new Date(filter.since) } : {}),
              ...(filter.until ? { lte: new Date(filter.until) } : {})
            }
          }
        : {})
    },
    orderBy: { ts: "desc" },
    take: limit,
    select: {
      ts: true, severity: true, category: true, message: true, appId: true,
      environment: true, requestId: true, actorCode: true, source: true, metadata: true,
      eventName: true, schemaVersion: true, sessionId: true, attemptId: true
    }
  });

  const records = filterRecords(rows.map(toRecord), { text: filter.text });

  if (wantExport) {
    const body = render(records, format, filter);
    const ext = format === "json" ? "json" : format === "csv" ? "csv" : "txt";
    const type = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": `${type}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="sangam-logs.${ext}"`
      }
    });
  }

  // The query this whole standard was written for: actions that were started
  // and never finished. A request with no result is a user who tried something
  // and was never told whether it worked.
  const unfinished = unfinishedAttempts(records);

  return NextResponse.json({
    count: records.length,
    scanned: rows.length,
    filter,
    facets: logFacets(records),
    retention: retentionFor(),
    unfinished,
    entries: records
  });
}

export async function DELETE(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await denyNonOperator(userId, "logs:delete")).denied) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const before = pick(new URL(req.url).searchParams, "before");
  if (!before) {
    // No date means everything, which is a big thing to do by accident.
    return NextResponse.json({ error: "Pass ?before=<iso> to delete by date" }, { status: 400 });
  }
  const when = new Date(before);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const res = await prisma.logEntry.deleteMany({ where: { ts: { lt: when } } });
  logAudit({ userId, action: "delete", resource: "logs", metadata: { before, deleted: res.count } });
  return NextResponse.json({ ok: true, deleted: res.count });
}
