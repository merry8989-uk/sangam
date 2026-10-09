"use client";
import { useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };
const STORE = "sangam_chat_v1";

export default function ChatPanel({
  loggedIn,
  agentName
}: {
  loggedIn: boolean;
  agentName?: string;
}) {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [useAgent, setUseAgent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Chat works without login: history lives in the browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) setMessages(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(messages.slice(-50)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, sessionId, useAgent })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Chat failed");
      if (d.sessionId) setSessionId(d.sessionId);
      setMessages((m) => [...m, { role: "assistant", content: d.content }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <span className="text-sm font-medium">Sangam AI · powered by Sarvam</span>
        <div className="flex items-center gap-2">
          {loggedIn && agentName && (
            <label className="flex items-center gap-1 text-xs text-ink-500">
              <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
              use {agentName}
            </label>
          )}
          <button onClick={newChat} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200">
            New chat
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-ink-500">
            Ask anything - in English or any Indian language. No sign-in needed.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-brand-600 text-white"
                : "bg-slate-100 text-ink-900"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="text-sm text-ink-500">Thinking...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
