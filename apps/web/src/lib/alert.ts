import { prisma } from "./prisma";
import { redis } from "./redis";

// Raise an alert: deduped to one per SLO+severity per hour, stored for
// history, and pushed to ALERT_WEBHOOK_URL when one is configured
// (Slack/Discord-compatible `text` field included).
export async function raiseAlert(
  slo: string,
  severity: "warning" | "critical",
  message: string,
  value: number
) {
  const bucket = new Date().toISOString().slice(0, 13); // hour
  try {
    const first = await redis.set(`alert:${slo}:${severity}:${bucket}`, "1", "EX", 3600, "NX");
    if (!first) return null;
  } catch {
    // If Redis is down, still record the alert rather than swallow it.
  }

  const alert = await prisma.alert
    .create({ data: { slo, severity, message, value } })
    .catch(() => null);

  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `[${severity}] ${slo}: ${message}`, slo, severity, value })
      });
    } catch {
      /* best effort */
    }
  }

  return alert;
}
