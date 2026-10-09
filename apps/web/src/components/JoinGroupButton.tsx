"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinGroupButton({ slug, initialJoined }: { slug: string; initialJoined: boolean }) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/groups/${slug}/join`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      setJoined(d.joined);
      router.refresh();
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-lg px-4 py-2 text-sm font-medium ${
        joined ? "border border-slate-300 hover:bg-slate-100" : "bg-brand-600 text-white hover:bg-brand-700"
      } disabled:opacity-50`}
    >
      {joined ? "Leave" : "Join"}
    </button>
  );
}
