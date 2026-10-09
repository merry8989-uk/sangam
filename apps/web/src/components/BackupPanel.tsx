"use client";
import { useCallback, useEffect, useState } from "react";

type Status = {
  enabled: boolean;
  frequency: string;
  provider: string;
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
