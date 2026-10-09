import { prisma } from "./prisma";
import { buildManifest, periodLabel, providerCanReceive } from "./backup";
import { encryptBackup, backupFileNameFor, openPassphrase, isBackupEncryptionMode } from "./backupCrypto";
import { withZohoToken, workDriveBaseForAccount } from "./zohoAccount";
import { getMyFolderId, uploadFile as workDriveUpload } from "./zohoWorkDrive";
import { withGoogleToken } from "./googleAccount";
import { ensureFolder, uploadFile as driveUpload } from "./googleDrive";

// Collect the chosen data, build the document, and push it to the target.
export async function runBackup(userId: string): Promise<{ ok: boolean; runId: string; error?: string }> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const provider = settings?.backupProvider ?? "ZOHO";
  const frequency = settings?.backupFrequency ?? "weekly";
  const now = new Date();

  const run = await prisma.backupRun.create({
    data: { userId, provider, frequency, periodLabel: periodLabel(frequency, now), status: "RUNNING" }
  });

  const fail = async (message: string) => {
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message.slice(0, 500), finishedAt: new Date() }
    });
    return { ok: false, runId: run.id, error: message };
  };

  try {
    if (!providerCanReceive(provider)) {
      return await fail("Terabox cannot receive files. Pick Zoho WorkDrive or Google Drive.");
    }

    const [chats, search, watch] = await Promise.all([
      settings?.backupChats
        ? prisma.chatSession.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 500,
            include: { messages: { orderBy: { createdAt: "asc" } } }
          })
        : Promise.resolve([]),
      settings?.backupSearchHistory
        ? prisma.searchHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5000 })
        : Promise.resolve([]),
      settings?.backupWatchHistory
        ? prisma.viewHistory.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: 5000 })
        : Promise.resolve([])
    ]);

    const manifest = buildManifest({
      userId,
      frequency,
      now,
      settings: {
        backupChats: settings?.backupChats,
        backupSearchHistory: settings?.backupSearchHistory,
        backupWatchHistory: settings?.backupWatchHistory
      },
      chats,
      search,
      watch
    });

    const plain = JSON.stringify(manifest, null, 2);

    // Encrypt before it leaves us, when the user asked for it.
    const mode = isBackupEncryptionMode(settings?.backupEncryption) ? settings!.backupEncryption : "server";
    let document = plain;
    if (mode !== "off") {
      const passphrase = mode === "passphrase" ? openPassphrase(settings?.backupPassphraseCipher ?? "", userId) : null;
      if (mode === "passphrase" && !passphrase) {
        return await fail("Passphrase encryption is on but no passphrase is saved. Set one in Settings.");
      }
      try {
        document = encryptBackup(plain, {
          mode,
          userId,
          period: manifest.period,
          createdAt: now.toISOString(),
          passphrase
        });
      } catch {
        return await fail("Could not encrypt the backup.");
      }
    }

    const json = document;
    const name = backupFileNameFor(manifest.period, mode !== "off");
    const sizeBytes = Buffer.byteLength(json, "utf8");

    let fileUrl: string | null = null;

    if (provider === "ZOHO") {
      const auth = await withZohoToken(userId);
      if (!auth) return await fail("Zoho is not connected.");
      const base = workDriveBaseForAccount(auth.account);
      const folderId = await getMyFolderId(base, auth.accessToken);
      if (!folderId) return await fail("Could not find your Zoho folder.");
      const up = await workDriveUpload(base, auth.accessToken, {
        parentId: folderId,
        filename: name,
        bytes: new TextEncoder().encode(json),
        contentType: "application/json"
      });
      if (!up) return await fail("Zoho refused the backup file.");
      fileUrl = up.permalink ?? null;
    } else if (provider === "GOOGLE") {
      const auth = await withGoogleToken(userId);
      if (!auth) return await fail("Google Drive is not connected.");
      const folderName = settings?.backupFolder?.trim() || "Sangam backups";
      const folderId = (await ensureFolder(auth.accessToken, folderName)) ?? undefined;
      const up = await driveUpload(auth.accessToken, { name, content: json, folderId });
      if (!up) return await fail("Google Drive refused the backup file.");
      fileUrl = up.webViewLink ?? null;
    }

    const total = (manifest.counts.chats ?? 0) + (manifest.counts.search ?? 0) + (manifest.counts.watch ?? 0);

    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "OK", itemCount: total, sizeBytes, fileUrl, finishedAt: new Date() }
    });
    await prisma.userSettings.update({ where: { userId }, data: { lastBackupAt: now } }).catch(() => {});

    return { ok: true, runId: run.id };
  } catch (err) {
    return await fail(err instanceof Error ? err.message : "Backup failed.");
  }
}

// Every user whose backup is switched on and whose slot has arrived.
export async function dueBackups(now = new Date()): Promise<string[]> {
  const rows = await prisma.userSettings.findMany({
    where: { backupEnabled: true },
    select: { userId: true, backupFrequency: true, lastBackupAt: true }
  });
  const { isDue } = await import("./backup");
  return rows.filter((r) => isDue(r.backupFrequency, r.lastBackupAt, now)).map((r) => r.userId);
}
