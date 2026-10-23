import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordRoute } from "@/lib/metrics";
import { filterEntries, filterFacets, formatReport, isDiagFormat, type DiagFilter } from "@/lib/diagnostics";
import type { DiagnosticReport } from "@/lib/diagnostics";
import { withLogging } from "@/lib/withLogging";

export const dynamic = "force-dynamic";

/**
 * Reports users have chosen to send. Guarded by the shared internal secret, the
 * same as the other job endpoints, so it is not reachable from the browser.
 *
 *   GET ?limit=50&userCode=&platform=&errors=1&q=&since=&until=
 *       the list, filtered on the stored columns
 *
 *   GET ?id=<id>&severity=&kind=&outcome=&session=&q=&format=
 *       one report, with its entries filtered, optionally rendered
 *
 * Two levels of filtering, because they cost different amounts. The list is
 * filtered on columns the database already indexes. The detail view loads the
 * body once and then filters the entries in memory, so a severity filter can
 * mean "show me only the errors in this report" without touching the rest.
 */

function pick(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v && v.trim() ? v.trim() : undefined;
}

export const GET = withLogging("internal:diagnostics:get", async (req: Request) => {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("internal-diagnostics", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const id = pick(params, "id");

  // ---------- one report, with its entries filtered ----------
  if (id) {
    const one = await prisma.diagnosticReport.findUnique({ where: { id } });
    if (!one) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The body is either the rendered text or the JSON report, depending on how
    // it was submitted. Only the JSON form can be filtered entry by entry.
    let report: DiagnosticReport | null = null;
    if (one.format === "json") {
      try {
        report = JSON.parse(one.body) as DiagnosticReport;
      } catch {
        report = null;
      }
    }

    if (!report) {
      return NextResponse.json({
        report: one,
        filtered: false,
        note: `This report was stored as ${one.format}, so its entries cannot be filtered.`
      });
    }

    const filter: DiagFilter = {
      severities: (pick(params, "severity") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is "error" | "warn" | "info" => s === "error" || s === "warn" || s === "info"),
      kinds: (pick(params, "kind") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      outcomes: (pick(params, "outcome") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is "success" | "failure" | "noop" => s === "success" || s === "failure" || s === "noop"),
      sessionId: pick(params, "session"),
      text: pick(params, "q"),
      since: pick(params, "since"),
      until: pick(params, "until")
    };

    const entries = filterEntries(report.entries, filter);
    const wanted = pick(params, "format");
    const out = { ...report, entries };

    await recordRoute("internal-diagnostics", 200);
    return NextResponse.json({
      filtered: true,
      matched: entries.length,
      total: report.entries.length,
      facets: filterFacets(report.entries),
      report: out,
      rendered: isDiagFormat(wanted) ? formatReport(out, wanted) : undefined
    });
  }

  // ---------- the list ----------
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 50), 1), 200);
  const since = pick(params, "since");
  const until = pick(params, "until");
  const q = pick(params, "q");

  const reports = await prisma.diagnosticReport.findMany({
    where: {
      ...(pick(params, "userCode") ? { userCode: pick(params, "userCode") } : {}),
      ...(pick(params, "platform") ? { platform: pick(params, "platform") } : {}),
      ...(pick(params, "route") ? { route: { contains: pick(params, "route") } } : {}),
      ...(q ? { note: { contains: q, mode: "insensitive" as const } } : {}),
      ...(since || until
        ? {
            createdAt: {
              ...(since ? { gte: new Date(since) } : {}),
              ...(until ? { lte: new Date(until) } : {})
            }
          }
        : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      userId: true,
      userCode: true,
      platform: true,
      appVersion: true,
      route: true,
      format: true,
      note: true,
      summary: true
    }
  });

  // `errors=1` keeps only the reports that actually recorded an error. Done here
  // rather than in SQL because the count lives inside the summary JSON.
  const onlyErrors = params.get("errors") === "1";
  const filtered = onlyErrors
    ? reports.filter((r) => {
        const counts = (r.summary as { counts?: { error?: number } } | null)?.counts;
        return (counts?.error ?? 0) > 0;
      })
    : reports;

  await recordRoute("internal-diagnostics", 200);
  return NextResponse.json({
    count: filtered.length,
    scanned: reports.length,
    reports: filtered
  });
});
