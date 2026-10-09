"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ClearHistory() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function clear() {
    if (!window.confirm("Clear your watch history?")) return;
    setBusy(true);
    await fetch("/api/history", { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      onClick={clear}
      disabled={busy}
      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "..." : "Clear history"}
    </button>
  );
}
