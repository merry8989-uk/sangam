"use client";
import { useState } from "react";

export default function ReportButton({
  entityType,
  entityId
}: {
  entityType: "post" | "user" | "comment" | "message";
  entityId: string;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function report() {
    const reason = window.prompt("Why are you reporting this? (spam, abuse, hate, other)");
    if (!reason) return;
    setBusy(true);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, reason })
    });
    setBusy(false);
    if (res.ok) setDone(true);
  }

  return (
    <button
      onClick={report}
      disabled={busy || done}
      className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-ink-700 hover:bg-slate-200 disabled:opacity-50"
    >
      {done ? "Reported" : "Report"}
    </button>
  );
}
