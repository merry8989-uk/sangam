"use client";
import { useCallback, useEffect, useState } from "react";

type Status = {
  enabled: boolean;
  frequency: string;
  provider: string;
  encryption: string;
  hasPassphrase: boolean;
  sections: { chats: boolean; search: boolean; watch: boolean };
  lastBackupAt: string | null;
  due: boolean;
  nextRunAt: string | null;
  connected: { zoho: boolean; google: boolean };
  runs: {
    id: string;
    provider: string;
    status: string;
    period: string;
    itemCount: number;
    sizeBytes: number;
    fileUrl: string | null;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
  }[];
};

const FREQUENCIES: [string, string][] = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["halfyearly", "Every six months"],
  ["yearly", "Yearly"]
];

// The settings field each section toggle writes to. Getting these wrong means
// the API rejects the whole update, so they are spelled out.
const SECTION_FIELD: Record<"chats" | "search" | "watch", string> = {
  chats: "backupChats",
  search: "backupSearchHistory",
  watch: "backupWatchHistory"
};

const PROVIDERS: [string, string][] = [
  ["ZOHO", "Zoho WorkDrive (preferred)"],
  ["GOOGLE", "Google Drive"],
  ["TERABOX", "Terabox"]
];

function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

// Back up chats, search history and watch history to a cloud account.
export default function BackupPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string; url?: string }[] | null>(null);
  const [restoreBusy, setRestoreBusy] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/backup/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Record<string, unknown>) {
    setStatus((s) => (s ? { ...s, ...patch } as Status : s));
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) setError("Could not save that.");
      await load();
    } catch {
      setError("Could not save that.");
    }
  }

  async function runNow() {
    setBusy("run");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/backup/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The backup failed.");
        return;
      }
      setNotice("Backup finished.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!status) return <p className="text-sm text-ink-500">Loading backup settings...</p>;

  const providerNeedsConnect =
    (status.provider === "ZOHO" && !status.connected.zoho) ||
    (status.provider === "GOOGLE" && !status.connected.google);

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="block text-sm">Back up my data</span>
          <span className="block text-xs text-ink-500">Chats, history and searches, on a schedule you choose.</span>
        </span>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={status.enabled}
          onChange={(e) => save({ backupEnabled: e.target.checked })}
        />
      </label>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">What to include</p>
        {(
          [
            ["chats", "Chat backup", "Your AI chat sessions and messages."],
            ["search", "Search history backup", "What you have searched for."],
            ["watch", "Watch history backup", "Videos you have watched."]
          ] as const
        ).map(([key, label, hint]) => (
          <label key={key} className="flex cursor-pointer items-start justify-between gap-3">
            <span>
              <span className="block text-sm">{label}</span>
              <span className="block text-xs text-ink-500">{hint}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={status.sections[key]}
              onChange={(e) => save({ [SECTION_FIELD[key]]: e.target.checked })}
            />
          </label>
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-3">
        <div>
          <label className="block text-sm">How often</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={status.frequency}
            onChange={(e) => save({ backupFrequency: e.target.value })}
          >
            {FREQUENCIES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm">Where to keep it</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={status.provider}
            onChange={(e) => save({ backupProvider: e.target.value })}
          >
            {PROVIDERS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {status.provider === "TERABOX" ? (
            <p className="mt-1 text-xs text-amber-700">
              Terabox cannot receive files - it has no supported way to write one. Pick Zoho or Google, or keep
              Terabox for storing links.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div>
          <label className="block text-sm">Encrypt the backup</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={status.encryption}
            onChange={(e) => save({ backupEncryption: e.target.value })}
          >
            <option value="off">No - plain JSON</option>
            <option value="server">Yes - with a key only this server holds</option>
            <option value="passphrase">Yes - with my own passphrase</option>
          </select>

          {status.encryption === "server" ? (
            <p className="mt-1 text-xs text-ink-500">
              The file in your Drive is unreadable without this server&apos;s key, so a leaked link or a shared folder
              does not expose it. We can still restore it for you.
            </p>
          ) : null}

          {status.encryption === "passphrase" ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">
                <span className="font-semibold">Read this first.</span> The file is locked with your passphrase, so it is
                useless to anyone who finds it - including us. But scheduled backups have to run while you are away, so
                we keep your passphrase encrypted on our side. That protects the backup in your Drive; it is not
                zero-knowledge. If you forget it, the backup cannot be opened.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="password"
                  className="min-w-[220px] flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm"
                  placeholder={status.hasPassphrase ? "Passphrase saved - type a new one to change it" : "Choose a passphrase (at least 8 characters)"}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (passphrase.length < 8) {
                      setError("A passphrase needs at least 8 characters.");
                      return;
                    }
                    save({ backupPassphrase: passphrase });
                    setPassphrase("");
                    setNotice("Passphrase saved.");
                  }}
                  disabled={passphrase.length < 8}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Save passphrase
                </button>
              </div>
              {status.hasPassphrase ? (
                <p className="mt-1 text-xs text-amber-900">A passphrase is saved.</p>
              ) : (
                <p className="mt-1 text-xs text-red-700">No passphrase saved yet - backups will fail until you set one.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {providerNeedsConnect ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">
            {status.provider === "ZOHO"
              ? "Zoho WorkDrive is not connected yet."
              : "Google Drive is not connected yet."}{" "}
            Connect it before the backup can run.
          </p>
          <a
            href={status.provider === "ZOHO" ? "/api/zoho/connect" : "/api/google/connect"}
            className="mt-2 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
          >
            Connect {status.provider === "ZOHO" ? "Zoho WorkDrive" : "Google Drive"}
          </a>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
        <button
          onClick={runNow}
          disabled={busy !== null || status.provider === "TERABOX"}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === "run" ? "Backing up..." : "Back up now"}
        </button>
        <span className="text-xs text-ink-500">
          {status.lastBackupAt
            ? `Last backup ${new Date(status.lastBackupAt).toLocaleString("en-IN")}`
            : "No backup has run yet."}
          {status.nextRunAt ? ` - next due ${new Date(status.nextRunAt).toLocaleDateString("en-IN")}` : ""}
        </span>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-brand-700">{notice}</p> : null}

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Restore</p>
        <p className="text-xs text-ink-500">
          Read a backup back into your account. Nothing is duplicated - a chat or search already here is skipped.
        </p>
        <button
          onClick={async () => {
            setRestoreBusy("list");
            setRestoreNote(null);
            try {
              const res = await fetch("/api/backup/files");
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setRestoreNote(data.error ?? "Could not list backups.");
                return;
              }
              setFiles(data.files ?? []);
            } finally {
              setRestoreBusy(null);
            }
          }}
          disabled={restoreBusy !== null}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          {restoreBusy === "list" ? "Looking..." : "Find my backups"}
        </button>

        {files ? (
          files.length === 0 ? (
            <p className="text-xs text-ink-500">No backup files found in your account.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs">
                  <span className="font-mono">{f.name}</span>
                  <button
                    onClick={async () => {
                      setRestoreBusy(f.id + ":dry");
                      setRestoreNote(null);
                      try {
                        const res = await fetch("/api/backup/restore", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ fileId: f.id, dryRun: true })
                        });
                        const d = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setRestoreNote(d.error ?? "Could not read that backup.");
                          return;
                        }
                        const w = d.wouldImport ?? {};
                        setRestoreNote(
                          `${f.name}: ${w.chats ?? 0} chats (${w.chatMessages ?? 0} messages), ${w.search ?? 0} searches, ${w.watch ?? 0} watched items${d.encrypted ? " - encrypted" : ""}.`
                        );
                      } finally {
                        setRestoreBusy(null);
                      }
                    }}
                    disabled={restoreBusy !== null}
                    className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50"
                  >
                    {restoreBusy === f.id + ":dry" ? "..." : "Preview"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Restore ${f.name} into your account?`)) return;
                      setRestoreBusy(f.id + ":run");
                      setRestoreNote(null);
                      try {
                        const res = await fetch("/api/backup/restore", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ fileId: f.id, passphrase: passphrase || undefined })
                        });
                        const d = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          setRestoreNote(d.error ?? "Restore failed.");
                          return;
                        }
                        const i = d.imported ?? {};
                        setRestoreNote(
                          `Restored ${i.chats ?? 0} chats, ${i.search ?? 0} searches, ${i.watch ?? 0} watched items. Skipped ${d.skipped?.chats ?? 0} chats and ${d.skipped?.search ?? 0} searches already here.`
                        );
                      } finally {
                        setRestoreBusy(null);
                      }
                    }}
                    disabled={restoreBusy !== null}
                    className="rounded-md bg-brand-600 px-2 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {restoreBusy === f.id + ":run" ? "Restoring..." : "Restore"}
                  </button>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                      open
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}

        {restoreNote ? <p className="text-xs text-brand-700">{restoreNote}</p> : null}
      </div>

      {status.runs.length > 0 ? (
        <div className="border-t border-slate-200 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Recent backups</p>
          <ul className="mt-2 space-y-1 text-xs">
            {status.runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className={r.status === "OK" ? "text-brand-700" : r.status === "FAILED" ? "text-red-600" : "text-ink-500"}>
                  {r.status}
                </span>
                <span className="text-ink-500">{r.provider} - {r.period}</span>
                {r.status === "OK" ? <span className="text-ink-500">{r.itemCount} items, {humanSize(r.sizeBytes)}</span> : null}
                {r.fileUrl ? (
                  <a href={r.fileUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                    open
                  </a>
                ) : null}
                {r.error ? <span className="text-red-600">{r.error}</span> : null}
                <span className="text-ink-500">{new Date(r.startedAt).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
