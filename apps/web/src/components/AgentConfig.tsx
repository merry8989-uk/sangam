"use client";
import { useState } from "react";

type Agent = {
  name: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  skills: string[];
  knowledgeBase: { title: string; content: string }[];
  scheduledTasks: { cron: string; prompt: string }[];
  connectors: { name: string; type: string }[];
  apiKey: string;
};

function lines(v: string): string[][] {
  return v
    .split("\n")
    .map((l) => l.split("::").map((s) => s.trim()))
    .filter((p) => p[0]);
}

export default function AgentConfig({ initial }: { initial: Agent }) {
  const [name, setName] = useState(initial.name);
  const [model, setModel] = useState(initial.model);
  const [temperature, setTemperature] = useState(initial.temperature);
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt);
  const [skills, setSkills] = useState(initial.skills.join(", "));
  const [kb, setKb] = useState(initial.knowledgeBase.map((k) => `${k.title} :: ${k.content}`).join("\n"));
  const [tasks, setTasks] = useState(initial.scheduledTasks.map((t) => `${t.cron} :: ${t.prompt}`).join("\n"));
  const [connectors, setConnectors] = useState(initial.connectors.map((c) => `${c.name} :: ${c.type}`).join("\n"));
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/agent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        model,
        temperature,
        systemPrompt,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        knowledgeBase: lines(kb).map((p) => ({ title: p[0], content: p[1] ?? "" })),
        scheduledTasks: lines(tasks).map((p) => ({ cron: p[0], prompt: p[1] ?? "" })),
        connectors: lines(connectors).map((p) => ({ name: p[0], type: p[1] ?? "" }))
      })
    });
    setBusy(false);
    setStatus(res.ok ? "Saved." : "Could not save.");
  }

  async function rotate() {
    const res = await fetch("/api/agent/rotate-key", { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      setApiKey(d.apiKey);
      setStatus("API key rotated - the old key no longer works.");
    }
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Your agent</h2>
        <p className="mb-4 text-xs text-ink-500">One agent per account.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm">
            Model
            <select className={field} value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="sarvam-105b">sarvam-105b (128K, reasoning)</option>
              <option value="sarvam-105b-conversations">sarvam-105b-conversations (32K, chat)</option>
            </select>
          </label>
          <label className="text-sm">
            Temperature
            <input
              type="number" step="0.1" min="0" max="2"
              className={field} value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          System prompt
          <textarea
            className={field} rows={3} value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </label>
      </section>

      <section id="skills" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Skills</h2>
        <p className="mb-2 text-xs text-ink-500">Comma-separated. Listed to the model as available skills.</p>
        <input className={field} value={skills} onChange={(e) => setSkills(e.target.value)}
               placeholder="summarise, translate, brainstorm" />
      </section>

      <section id="knowledge" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Knowledge base</h2>
        <p className="mb-2 text-xs text-ink-500">One entry per line, as <code>Title :: content</code>.</p>
        <textarea className={field} rows={4} value={kb} onChange={(e) => setKb(e.target.value)}
                  placeholder="Pricing :: We are free to use." />
      </section>

      <section id="scheduled" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Scheduled tasks</h2>
        <p className="mb-2 text-xs text-ink-500">
          One per line, as <code>cron :: prompt</code>. Stored on the agent; a scheduler worker runs them.
        </p>
        <textarea className={field} rows={3} value={tasks} onChange={(e) => setTasks(e.target.value)}
                  placeholder="0 9 * * * :: Summarise yesterday's posts" />
      </section>

      <section id="connectors" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Connectors</h2>
        <p className="mb-2 text-xs text-ink-500">One per line, as <code>name :: type</code>.</p>
        <textarea className={field} rows={3} value={connectors} onChange={(e) => setConnectors(e.target.value)}
                  placeholder="My CRM :: webhook" />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Saving..." : "Save agent"}
        </button>
        {status && <span className="text-sm text-ink-500">{status}</span>}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Agent API</h2>
        <p className="mb-2 text-xs text-ink-500">
          Call your agent from anywhere with this key. Keep it secret.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs">{apiKey}</code>
          <button onClick={rotate} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium hover:bg-slate-200">
            Rotate
          </button>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-ink-700">
{`curl -X POST /api/agent/chat \
  -H "Authorization: Bearer ${apiKey.slice(0, 12)}..." \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`}
        </pre>
      </section>
    </div>
  );
}
