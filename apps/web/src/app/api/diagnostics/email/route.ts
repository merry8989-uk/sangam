import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getViewerId } from "@/lib/viewer";
import { getSettingsOptional } from "@/lib/settings";
import { APP_VERSION } from "@/lib/appInfo";
import { buildReport, formatReport, reportFilename, mimeType, isDiagFormat } from "@/lib/diagnostics";
import { mailerConfigured, sendMail, toBase64 } from "@/lib/mailer";
import { ensureUserCode } from "@/lib/userCodeServer";
import { createNotionPage, notionConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

/**
 * Email the report to support, with the report attached.
 *
 * A mailto link and a Gmail compose URL can both fill in the recipient, subject
 * and body, but neither can carry a file - the URI schemes have no field for
 * one. So the only way a report arrives attached without the user doing anything
 * is for the server to send it. That is what this route is for.
 *
 * Two rules, both deliberate:
 *
 *  1. The recipient is never taken from the request. It is always
 *     DIAGNOSTICS_SUPPORT_EMAIL from the environment. Accepting a recipient
 *     would turn this into an open relay that anyone could use to send mail to
 *     anyone, from our domain.
 *  2. It is rate limited per user, because it costs money per message and an
 *     unbounded endpoint is an invitation.
 */
const Entry = z.object({
  at: z.string().max(40),
  kind: z.string().max(40),
  severity: z.enum(["error", "warn", "info"]),
  outcome: z.enum(["success", "failure", "noop"]).optional(),
  sessionId: z.string().max(40).optional(),
  message: z.string().max(4000),
  detail: z.record(z.string(), z.unknown()).optional()
});

const Body = z.object({
  note: z.string().max(2000).optional(),
  platform: z.string().max(40).optional(),
  appVersion: z.string().max(60).optional(),
  format: z.string().max(8).optional(),
  sessionId: z.string().max(40).optional(),
  entries: z.array(Entry).max(1000),
  client: z.record(z.string(), z.unknown()).optional()
});

const RATE_LIMIT = 5;
const RATE_WINDOW_SEC = 3600;

export async function POST(req: Request) {
  const userId = await getViewerId(req);

  const settings = await getSettingsOptional(userId);
  if (settings && settings.diagnosticsEnabled === false) {
    return NextResponse.json({ error: "Diagnostics are turned off" }, { status: 403 });
  }

  const support = (process.env.DIAGNOSTICS_SUPPORT_EMAIL ?? "").trim();
  if (!support) {
    return NextResponse.json(
      { error: "No support address is configured on this server" },
      { status: 503 }
    );
  }
  if (!mailerConfigured()) {
    return NextResponse.json(
      { error: "No mail provider is configured on this server" },
      { status: 503 }
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  // Rate limit per account, falling back to per-address for anonymous senders.
  const key = `diagmail:${userId ?? req.headers.get("x-forwarded-for") ?? "anon"}`;
  try {
    const used = await redis.incr(key);
    if (used === 1) await redis.expire(key, RATE_WINDOW_SEC);
    if (used > RATE_LIMIT) {
      return NextResponse.json(
        { error: "Too many reports sent. Try again later." },
        { status: 429 }
      );
    }
  } catch {
    // If the cache is down, allow the send rather than block a real report.
  }

  // Rebuild through buildReport so the redaction is the tested path.
  const report = buildReport({
    platform: data.platform ?? "web",
    appVersion: data.appVersion ?? APP_VERSION,
    signedIn: Boolean(userId),
    userId: userId ?? null,
    client: (data.client ?? null) as never,
    sessionId: data.sessionId,
    entries: data.entries
  });

  const format = isDiagFormat(data.format) ? data.format : "md";
  const userCode = userId ? await ensureUserCode(userId) : null;
  const filename = reportFilename(report, format);
  const bodyText = formatReport(report, format);

  // Store it first. A mail failure must not lose the report.
  const saved = await prisma.diagnosticReport.create({
    data: {
      userId: userId ?? null,
      userCode: userCode ?? "",
      note: data.note ?? "",
      platform: report.platform,
      appVersion: report.appVersion,
      route: report.client?.route ?? "",
      format,
      body: bodyText,
      summary: {
        id: report.id,
        schemaVersion: report.schemaVersion,
        sessionId: report.sessionId,
        counts: report.counts,
        entries: report.entries.length
      }
    },
    select: { id: true }
  });

  // A row in Notion as well, so the report is in both places support looks.
  let notionUrl: string | null = null;
  if (notionConfigured()) {
    const n = await createNotionPage(report, { code: userCode, note: data.note ?? "", deliveredBy: "email" });
    notionUrl = n.url ?? null;
  }

  const intro: string[] = [];
  intro.push("A diagnostics report was sent from the Sangam app.");
  intro.push("");
  intro.push("What the user said (may be empty):");
  intro.push(`  ${(data.note ?? "").trim() || "(nothing)"}`);
  intro.push("");
  intro.push(`User code : ${userCode ?? "SG-ANON"}`);
  intro.push(`Report id : ${report.id}`);
  intro.push(`Schema    : ${report.schemaVersion}`);
  intro.push(`Session   : ${report.sessionId}`);
  intro.push(`App       : ${report.appVersion} (${report.platform})`);
  intro.push(`Events    : ${report.entries.length} (${report.counts.error} errors, ${report.counts.warn} warnings)`);
  if (report.client) intro.push(`Route     : ${report.client.route}`);
  intro.push("");
  intro.push(`The full report is attached as ${filename}.`);

  const result = await sendMail({
    to: support,
    from: (process.env.EMAIL_FROM ?? "").trim(),
    subject: `[Sangam] diagnostics ${report.id} - ${report.entries.length} events, ${report.counts.error} errors`,
    text: intro.join("\n"),
    attachment: {
      filename,
      content: toBase64(bodyText),
      contentType: mimeType(format)
    }
  });

  return NextResponse.json(
    {
      ok: result.ok,
      storedId: saved.id,
      reportId: report.id,
      userCode: userCode ?? "SG-ANON",
      notion: notionUrl,
      provider: result.provider,
      detail: result.detail
    },
    { status: result.ok ? 200 : 502 }
  );
}
