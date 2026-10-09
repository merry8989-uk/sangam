"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function mark() {
    setBusy(true);
    await fetch("/api/notifications/read", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={mark}
      disabled={busy}
      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
    >
      {busy ? "..." : "Mark all read"}
    </button>
  );
}
