"use client";
import { useState } from "react";

type Result = Record<string, unknown> | null;

export default function AgentAssist() {
  const [text, setText] = useState("");
  const [tone, setTone] = useState("friendly");
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  async function run(task: "captions" | "hashtags" | "title") {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, text, tone })
      });
      const d = await res.json();
      setResult(d.result ?? { error: d.error });
    } catch {
      setResult({ error: "Assist service unavailable" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Creator agents</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Describe your post or paste your draft..."
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="friendly">Friendly</option>
          <option value="professional">Professional</option>
          <option value="excited">Excited</option>
        </select>
        <button onClick={() => run("captions")} disabled={busy} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          Captions
        </button>
        <button onClick={() => run("hashtags")} disabled={busy} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 disabled:opacity-50">
          Hashtags
        </button>
        <button onClick={() => run("title")} disabled={busy} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium hover:bg-slate-200 disabled:opacity-50">
          Title &amp; description
        </button>
      </div>
      {result && (
        <pre className="mt-3 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-ink-700">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}
