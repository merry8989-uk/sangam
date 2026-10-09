import { prisma } from "./prisma";
import { decryptBackup, isEncryptedBackup, openPassphrase } from "./backupCrypto";
import { parseManifest, summarise, chatDedupeKey, searchDedupeKey, type ParsedManifest } from "./backupRestore";
import { withZohoToken, workDriveBaseForAccount } from "./zohoAccount";
import { getMyFolderId, listFiles as wdList, downloadFileText as wdDownload } from "./zohoWorkDrive";
import { withGoogleToken } from "./googleAccount";
import { listBackupFiles as gdList, downloadFileText as gdDownload } from "./googleDrive";

export type BackupFile = { id: string; name: string; createdAt?: string; url?: string };

// Backup documents sitting in the connected account.
export async function listBackupFiles(userId: string): Promise<{ provider: string; files: BackupFile[] } | null> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const provider = settings?.backupProvider ?? "ZOHO";

  if (provider === "ZOHO") {
    const auth = await withZohoToken(userId);
    if (!auth) return null;
    const base = workDriveBaseForAccount(auth.account);
    const folderId = await getMyFolderId(base, auth.accessToken);
    if (!folderId) return { provider, files: [] };
    const files = await wdList(base, auth.accessToken, folderId);
    return {
      provider,
      files: files
        .filter((f) => f.name.includes("sangam-backup-"))
        .map((f) => ({ id: f.id, name: f.name, url: f.permalink }))
    };
  }

  if (provider === "GOOGLE") {
    const auth = await withGoogleToken(userId);
    if (!auth) return null;
    const files = await gdList(auth.accessToken);
    return { provider, files: files.map((f) => ({ id: f.id, name: f.name, url: f.webViewLink })) };
  }

  return { provider, files: [] };
}

async function fetchBackupText(userId: string, provider: string, fileId: string): Promise<string | null> {
  if (provider === "ZOHO") {
    const auth = await withZohoToken(userId);
    if (!auth) return null;
    return wdDownload(workDriveBaseForAccount(auth.account), auth.accessToken, fileId);
  }
  if (provider === "GOOGLE") {
    const auth = await withGoogleToken(userId);
    if (!auth) return null;
    return gdDownload(auth.accessToken, fileId);
  }
  return null;
}

export type RestoreReport = {
  ok: boolean;
  dryRun: boolean;
  error?: string;
  period?: string;
  encrypted?: boolean;
  wouldImport?: ReturnType<typeof summarise>;
  imported?: { chats: number; chatMessages: number; search: number; watch: number };
  skipped?: { chats: number; search: number };
  dropped?: Record<string, number>;
  truncated?: string[];
};

// Read a backup file and put its contents back. Merges rather than replaces,
// and never duplicates a chat or a search entry that is already there.
export async function restoreBackup(
  userId: string,
  opts: { provider: string; fileId: string; passphrase?: string | null; dryRun?: boolean }
): Promise<RestoreReport> {
  const text = await fetchBackupText(userId, opts.provider, opts.fileId);
  if (text === null) return { ok: false, dryRun: Boolean(opts.dryRun), error: "Could not read that file." };

  let document = text;
  const encrypted = isEncryptedBackup(text);
  if (encrypted) {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const passphrase = opts.passphrase || openPassphrase(settings?.backupPassphraseCipher ?? "", userId);
    const opened = decryptBackup(text, { userId, passphrase });
    if (opened === null) {
      return {
        ok: false,
        dryRun: Boolean(opts.dryRun),
        encrypted: true,
        error: opts.passphrase || passphrase ? "Could not open it - the passphrase looks wrong." : "This backup needs a passphrase."
      };
    }
    document = opened;
  }

  const parsed = parseManifest(document);
  if (!parsed.ok) return { ok: false, dryRun: Boolean(opts.dryRun), encrypted, error: parsed.error };

  const manifest: ParsedManifest = parsed.manifest;
  const wouldImport = summarise(manifest);

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      period: manifest.period,
      encrypted,
      wouldImport,
      dropped: parsed.dropped,
      truncated: parsed.truncated
    };
  }

  const imported = { chats: 0, chatMessages: 0, search: 0, watch: 0 };
  const skipped = { chats: 0, search: 0 };

  // ---- chats ----
  if (manifest.chats.length > 0) {
    const existing = await prisma.chatSession.findMany({ where: { userId }, select: { title: true, updatedAt: true } });
    const seen = new Set(existing.map((e) => chatDedupeKey(e.title, e.updatedAt.toISOString())));

    for (const chat of manifest.chats) {
      if (seen.has(chatDedupeKey(chat.title, chat.updatedAt))) {
        skipped.chats++;
        continue;
      }
      await prisma.chatSession.create({
        data: {
          userId,
          title: chat.title,
          updatedAt: new Date(chat.updatedAt),
          messages: {
            create: chat.messages.map((m) => ({
              role: m.role,
              content: m.content,
              createdAt: new Date(m.createdAt)
            }))
          }
        }
      });
      imported.chats++;
      imported.chatMessages += chat.messages.length;
    }
  }

  // ---- search history ----
  if (manifest.search.length > 0) {
    const existing = await prisma.searchHistory.findMany({ where: { userId }, select: { query: true, createdAt: true } });
    const seen = new Set(existing.map((e) => searchDedupeKey(e.query, e.createdAt.toISOString())));

    for (const s of manifest.search) {
      if (seen.has(searchDedupeKey(s.query, s.createdAt))) {
        skipped.search++;
        continue;
      }
      await prisma.searchHistory.create({ data: { userId, query: s.query, createdAt: new Date(s.createdAt) } });
      imported.search++;
    }
  }

  // ---- watch history ----
  if (manifest.watch.length > 0) {
    for (const w of manifest.watch) {
      // Only posts that still exist, and one row per post.
      const post = await prisma.post.findUnique({ where: { id: w.postId }, select: { id: true } });
      if (!post) continue;
      await prisma.viewHistory.upsert({
        where: { userId_postId: { userId, postId: w.postId } },
        create: { userId, postId: w.postId, viewedAt: new Date(w.viewedAt) },
        update: { viewedAt: new Date(w.viewedAt) }
      });
      imported.watch++;
    }
  }

  return {
    ok: true,
    dryRun: false,
    period: manifest.period,
    encrypted,
    imported,
    skipped,
    dropped: parsed.dropped,
    truncated: parsed.truncated
  };
}
