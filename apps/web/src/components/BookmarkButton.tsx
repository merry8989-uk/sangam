"use client";
import { useEffect, useState } from "react";

export default function BookmarkButton({ postId }: { postId: string }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/bookmarks?postId=${postId}`)
      .then((r) => (r.ok ? r.json() : { saved: false }))
      .then((d) => {
        if (active) setSaved(Boolean(d.saved));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [postId]);

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId })
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setSaved(d.saved);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-3 py-1 text-sm font-medium ${
        saved ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-ink-700 hover:bg-slate-200"
      }`}
    >
      {saved ? "Saved" : "Save"}
    </button>
  );
}
