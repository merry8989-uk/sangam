"use client";

import { useState } from "react";

/**
 * Share a post. The share count is a denormalised counter on the post, bumped
 * by /api/shares. The button keeps its own state so pressing it twice undoes it.
 */
export default function ShareButton({
  postId,
  initialCount = 0,
  showCount = true,
  showLabel = true
}: {
  postId: string;
  initialCount?: number;
  showCount?: boolean;
  showLabel?: boolean;
}) {
  const [shared, setShared] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const undo = shared;
    const optimistic = !shared;
    setShared(optimistic);
    setCount((c) => Math.max(0, c + (optimistic ? 1 : -1)));
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, undo })
      });
      if (res.ok) {
        const d = await res.json();
        setCount(d.shareCount);
      } else {
        setShared(undo);
        setCount((c) => Math.max(0, c + (optimistic ? -1 : 1)));
      }
    } catch {
      setShared(undo);
      setCount((c) => Math.max(0, c + (optimistic ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-3 py-1 text-sm font-medium ${
        shared ? "bg-slate-200 text-ink-900" : "bg-slate-100 text-ink-700 hover:bg-slate-200"
      }`}
    >
      {showLabel ? (shared ? "Shared" : "Share") : "↗"}
      {showCount ? ` · ${count}` : ""}
    </button>
  );
}
