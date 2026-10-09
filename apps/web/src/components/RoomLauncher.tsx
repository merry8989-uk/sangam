"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Start a call, a meeting or a live stream, or join one by code.
export default function RoomLauncher() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function start(kind: "CALL" | "MEETING" | "LIVE") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, visibility: kind === "LIVE" ? "PUBLIC" : "PRIVATE" })
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Sign in first." : "Could not start.");
        return;
      }
      const data = await res.json();
      router.push(`/room/${data.room.id}`);
    } catch {
      setError("Could not start.");
    } finally {
      setBusy(null);
    }
  }

  async function joinByCode() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy("JOIN");
    setError(null);
    try {
      const res = await fetch(`/api/rooms/code/${encodeURIComponent(c)}`);
      if (!res.ok) {
        setError("No room with that code.");
        return;
      }
      const data = await res.json();
      router.push(`/room/${data.room.id}?code=${encodeURIComponent(c)}`);
    } catch {
      setError("Could not join.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Start or join</h2>
      <p className="mt-1 text-xs text-ink-500">
        Calls, meetings and live streams all run on the same media server.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => start("CALL")} disabled={busy !== null} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy === "CALL" ? "Starting..." : "Start a call"}
        </button>
        <button onClick={() => start("MEETING")} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy === "MEETING" ? "Starting..." : "Start a meeting"}
        </button>
        <button onClick={() => start("LIVE")} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy === "LIVE" ? "Starting..." : "Go live"}
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
          placeholder="Join code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button onClick={joinByCode} disabled={busy !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy === "JOIN" ? "Joining..." : "Join"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
