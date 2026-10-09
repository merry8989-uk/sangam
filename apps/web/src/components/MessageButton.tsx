"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Opens (or starts) the 1:1 conversation with a user.
export default function MessageButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const res = await fetch("/api/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      router.push(`/messages/${d.conversationId}`);
    }
  }

  return (
    <button
      onClick={start}
      disabled={busy}
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
    >
      {busy ? "..." : "Message"}
    </button>
  );
}
