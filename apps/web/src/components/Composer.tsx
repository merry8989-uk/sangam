"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Composer() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!caption.trim()) return;
    setBusy(true);
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption, type: "TEXT", visibility: "PUBLIC" })
    });
    setBusy(false);
    if (res.ok) {
      setCaption("");
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Share something..."
        rows={3}
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
