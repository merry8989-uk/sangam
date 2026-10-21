import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { getSettingsOptional } from "@/lib/settings";
import { APP_VERSION } from "@/lib/appInfo";
import { buildReport, redactValue, isDiagFormat } from "@/lib/diagnostics";
import { ensureUserCode } from "@/lib/userCodeServer";
import { createNotionPage, notionConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

/**
 * A report the user chose to send.
 *
 * The report is redacted again here, on the server. The browser already
 * redacted it, but the browser is the user's machine and anything it sends can
 * be edited before it arrives - so the rule that no token or password is ever
 * stored is enforced on this side too, on input we have not seen before.
 *
 * Nothing is uploaded unless the user pressed Send.
 */
const Entry = z.object({
  at: z.string().max(40),
  kind: z.string().max(40),
  severity: z.enum(["error", "warn", "info"]),
  message: z.string().max(4000),
  detail: z.record(z.string(), z.unknown()).optional()
});

const Body = z.object({
  note: z.string().max(2000).optional(),
  platform: z.string().max(40).optional(),
  appVersion: z.string().max(60).optional(),
  format: z.string().max(8).optional(),
  entries: z.array(Entry).max(1000),
  client: z.record(z.string(), z.unknown()).optional(),
  // Where to deliver it, if the deployment configured a webhook.
  forward: z.boolean().optional()
});

export async function POST(req: Request) {
  const userId = await getViewerId(req);

  const settings = await getSettingsOptional(userId);
  if (settings && settings.diagnosticsEnabled === false) {
    return NextResponse.json({ error: "Diagnostics are turned off" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  // Rebuild through buildReport, which is the tested path: it redacts every
  // entry and caps the list.
  const report = buildReport({
    platform: data.platform ?? "web",
    appVersion: data.appVersion ?? APP_VERSION,
    signedIn: Boolean(userId),
    userId: userId ?? null,
    client: (redactValue(data.client ?? null) as never) ?? null,
    entries: data.entries
  });

  const format = isDiagFormat(data.format) ? data.format : "json";
  // The pseudonymous code, created on first use. This is what every downstream
  // view sees instead of an id, a name or an email.
  const userCode = userId ? await ensureUserCode(userId) : null;

  const saved = await prisma.diagnosticReport.create({
    data: {
      userId: userId ?? null,
      userCode: userCode ?? "",
      note: data.note ?? "",
      platform: report.platform,
      appVersion: report.appVersion,
      route: report.client?.route ?? "",
      format,
      body: JSON.stringify(report),
      summary: {
        id: report.id,
        counts: report.counts,
        entries: report.entries.length,
        node: report.server?.nodeVersion ?? null
      }
    },
    select: { id: true }
  });

  // A row in Notion, so support sees it where they already look. Best effort:
  // the report is already stored, so a Notion outage must not fail the request.
  let notion = { ok: false, url: undefined as string | undefined };
  if (notionConfigured()) {
    const r = await createNotionPage(report, {
      code: userCode,
      note: data.note ?? "",
      deliveredBy: "app"
    });
    notion = { ok: r.ok, url: r.url };
  }

  // Optional delivery, if the deployment set one up. Best effort: a failure to
  // forward must not lose the report, which is already stored.
  const hook = process.env.DIAGNOSTICS_WEBHOOK_URL;
  let forwarded = false;
  if (hook && data.forward !== false) {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: saved.id, report })
      });
      forwarded = res.ok;
    } catch {
      forwarded = false;
    }
  }

  return NextResponse.json({
    ok: true,
    id: saved.id,
    reportId: report.id,
    userCode: userCode ?? "SG-ANON",
    notion: notion.url ?? null,
    forwarded
  });
}
