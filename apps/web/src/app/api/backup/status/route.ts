import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { getSettingsOptional } from "@/lib/settings";
import { isDue, nextRunAt } from "@/lib/backup";
import { getZohoAccount } from "@/lib/zohoAccount";
import { getGoogleAccount } from "@/lib/googleAccount";

// What the settings screen needs: the last few runs and when the next is due.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [settings, runs, zoho, google] = await Promise.all([
    getSettingsOptional(userId),
    prisma.backupRun.findMany({ where: { userId }, orderBy: { startedAt: "desc" }, take: 10 }),
    getZohoAccount(userId),
    getGoogleAccount(userId)
  ]);

  const lastRun = runs[0] ?? null;
  const lastAt = settings?.lastBackupAt ?? lastRun?.startedAt ?? null;

  return NextResponse.json({
    enabled: Boolean(settings?.backupEnabled),
    frequency: settings?.backupFrequency ?? "weekly",
    provider: settings?.backupProvider ?? "ZOHO",
    sections: {
      chats: settings?.backupChats ?? true,
      search: settings?.backupSearchHistory ?? true,
      watch: settings?.backupWatchHistory ?? true
    },
    lastBackupAt: lastAt,
    due: isDue(settings?.backupFrequency ?? "weekly", lastAt, new Date()),
    nextRunAt: lastAt ? nextRunAt(settings?.backupFrequency ?? "weekly", lastAt) : null,
    connected: { zoho: Boolean(zoho), google: Boolean(google) },
    runs: runs.map((r) => ({
      id: r.id,
      provider: r.provider,
      status: r.status,
      period: r.periodLabel,
      itemCount: r.itemCount,
      sizeBytes: r.sizeBytes,
      fileUrl: r.fileUrl,
      error: r.error,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt
    }))
  });
}
