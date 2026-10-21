import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getViewerId } from "@/lib/viewer";
import { getSettingsOptional } from "@/lib/settings";
import { APP_VERSION } from "@/lib/appInfo";
import { mailerConfigured } from "@/lib/mailer";
import type { DiagCheck, DiagServerInfo } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

/**
 * The server half of a diagnostics report.
 *
 * Everything here is environment and health - never request bodies, never
 * another user's data, never a secret value. Feature switches are reported as
 * on/off, not as their configured values, because a configured value is often
 * a key.
 */

async function timed(name: string, fn: () => Promise<boolean>, note = ""): Promise<DiagCheck> {
  const started = Date.now();
  let ok = false;
  try {
    ok = await fn();
  } catch {
    ok = false;
  }
  return { name, ok, ms: Date.now() - started, note: ok ? note : note || "did not respond" };
}

async function aiReachable(): Promise<boolean> {
  const base = process.env.AI_SERVICE_URL;
  if (!base) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/health`, { signal: controller.signal });
    return res.ok;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: Request) {
  const userId = await getViewerId(req);

  // The user's own switch. A report is only assembled if they left it on.
  const settings = await getSettingsOptional(userId);
  if (settings && settings.diagnosticsEnabled === false) {
    return NextResponse.json({ enabled: false, server: null, supportEmail: "", emailReady: false });
  }

  const checks = await Promise.all([
    timed("database", async () => {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    }),
    timed("cache", async () => (await redis.ping()) === "PONG"),
    timed("ai service", aiReachable)
  ]);

  const on = (v: string | undefined) => Boolean(v && v.trim() !== "");

  const server: DiagServerInfo = {
    appVersion: APP_VERSION,
    nodeVersion: process.version,
    uptimeSec: Math.round(process.uptime()),
    env: process.env.NODE_ENV || "development",
    checks,
    features: {
      "media queue": on(process.env.MEDIA_QUEUE_ENABLED) && process.env.MEDIA_QUEUE_ENABLED === "true",
      meilisearch: on(process.env.MEILISEARCH_URL),
      "livekit configured": on(process.env.LIVEKIT_API_KEY),
      "ai key configured": on(process.env.SARVAM_API_KEY),
      "moderation models": process.env.MODERATION_ENABLED === "true",
      embeddings: process.env.EMBEDDINGS_ENABLED === "true",
      "separate ml service": on(process.env.ML_INFERENCE_URL),
      "zoho backup": on(process.env.ZOHO_CLIENT_ID),
      "google backup": on(process.env.GOOGLE_CLIENT_ID),
      "sms provider": on(process.env.SMS_PROVIDER),
      "alert webhook": on(process.env.ALERT_WEBHOOK_URL),
      "backup encryption key set": on(process.env.BACKUP_KEY) || on(process.env.SECRETS_KEY),
      // Whether a support address is configured - never the address itself.
      "support address configured": on(process.env.DIAGNOSTICS_SUPPORT_EMAIL),
      "mail provider configured": mailerConfigured()
    }
  };

  return NextResponse.json({
    enabled: true,
    server,
    // A support address is meant to be seen by users - it is what they write
    // to. It comes from the environment so it is not published with the source.
    supportEmail: (process.env.DIAGNOSTICS_SUPPORT_EMAIL ?? "").trim(),
    // When this is true the server can send the report itself, which is the
    // only path that arrives with a real attachment and no user step.
    emailReady: mailerConfigured()
  });
}
