"use client";
import { useEffect, useState } from "react";

export default function BlockMuteButtons({ targetId }: { targetId: string }) {
  const [blocking, setBlocking] = useState(false);
  const [muting, setMuting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/blocks?userId=${targetId}`).then((r) => (r.ok ? r.json() : {})),
      fetch(`/api/mutes?userId=${targetId}`).then((r) => (r.ok ? r.json() : {}))
    ])
      .then(([b, m]) => {
        if (active) {
          setBlocking(Boolean(b.blocking));
          setMuting(Boolean(m.muting));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [targetId]);

  async function toggle(kind: "blocks" | "mutes") {
    setBusy(true);
    const res = await fetch(`/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetId })
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      if (kind === "blocks") setBlocking(d.blocking);
      else setMuting(d.muting);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => toggle("blocks")}
        disabled={busy}
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          blocking ? "bg-red-50 text-red-600" : "border border-slate-300 hover:bg-slate-100"
        }`}
      >
        {blocking ? "Blocked" : "Block"}
      </button>
      <button
        onClick={() => toggle("mutes")}
        disabled={busy}
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          muting ? "bg-slate-200" : "border border-slate-300 hover:bg-slate-100"
        }`}
      >
        {muting ? "Muted" : "Mute"}
      </button>
    </div>
  );
}
