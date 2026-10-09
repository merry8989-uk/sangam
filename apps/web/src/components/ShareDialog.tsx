"use client";
import { useCallback, useEffect, useState } from "react";

type Share = {
  id: string;
  role: string;
  link: string | null;
  expiresAt: string | null;
  user: { id: string; username: string; displayName: string | null } | null;
};

// Share a drive item with a person, or create a link anyone can open.
export default function ShareDialog({ itemId, canManage }: { itemId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/drive/${itemId}/share`);
      if (res.ok) setShares((await res.json()).shares ?? []);
    } catch {
      // ignore
    }
  }, [itemId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function shareWithPerson() {
    const name = username.trim();
    if (!name) return;
    setBusy("person");
    setError(null);
    try {
      const res = await fetch(`/api/drive/${itemId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, role, expiresInDays: days || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not share.");
        return;
      }
      setUsername("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function createLink() {
    setBusy("link");
    setError(null);
    try {
      const res = await fetch(`/api/drive/${itemId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: true, role, expiresInDays: days || undefined })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create a link.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/drive/shares/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!canManage) return null;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
        Share
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-sm font-medium">Share this item</p>

          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <select className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as "VIEWER" | "EDITOR")}>
              <option value="VIEWER">Can view</option>
              <option value="EDITOR">Can edit</option>
            </select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={0}>No expiry</option>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
            <button onClick={shareWithPerson} disabled={busy !== null} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {busy === "person" ? "Sharing..." : "Share"}
            </button>
            <button onClick={createLink} disabled={busy !== null} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50">
              {busy === "link" ? "Creating..." : "Create a link"}
            </button>
          </div>

          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

          <div className="mt-3 space-y-2">
            {shares.length === 0 ? (
              <p className="text-xs text-ink-500">Not shared with anyone yet.</p>
            ) : (
              shares.map((s) => (
                <div key={s.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {s.user ? `@${s.user.username}` : "Anyone with the link"} - {s.role === "EDITOR" ? "can edit" : "can view"}
                    </span>
                    <button onClick={() => revoke(s.id)} disabled={busy !== null} className="shrink-0 text-red-600">
                      Revoke
                    </button>
                  </div>
                  {s.link ? (
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(s.link as string);
                        setCopied(s.id);
                        setTimeout(() => setCopied(null), 1500);
                      }}
                      className="mt-1 break-all text-left text-brand-700 underline"
                    >
                      {copied === s.id ? "Copied" : s.link}
                    </button>
                  ) : null}
                  {s.expiresAt ? <p className="mt-1 text-ink-500">Expires {new Date(s.expiresAt).toLocaleDateString("en-IN")}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
