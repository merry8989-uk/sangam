"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Msg = { id: string; senderId: string; body: string; createdAt: string };
type Other = { id: string; username: string; displayName: string; avatarUrl: string | null } | null;

// Polling thread. A WebSocket/SSE upgrade would remove the 4s delay.
export default function DirectMessageThread({
  conversationId,
  meId,
  other,
  initial,
  background
}: {
  conversationId: string;
  meId: string;
  other: Other;
  initial: Msg[];
  background?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/dm/${conversationId}`);
      if (!res.ok) return;
      const d = await res.json();
      setMessages(d.messages ?? []);
    } catch {
      /* ignore */
    }
  }, [conversationId]);

  // Live updates over SSE, with a slow poll as a fallback if the stream drops.
  useEffect(() => {
    const source = new EventSource(`/api/dm/${conversationId}/stream`);
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "message" && data.message?.id) {
          setMessages((prev) =>
            prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
          );
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    const fallback = setInterval(refresh, 30000);
    return () => {
      source.close();
      clearInterval(fallback);
    };
  }, [conversationId, refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await fetch(`/api/dm/${conversationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text })
    });
    setBusy(false);
    if (res.ok) {
      setBody("");
      await refresh();
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-sm font-medium">
        <span
          className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-slate-300"}`}
          title={live ? "Live" : "Reconnecting"}
        />
        @{other?.username ?? "unknown"}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" style={background ? { background } : undefined}>
        {messages.length === 0 && <p className="text-sm text-ink-500">No messages yet. Say hello.</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.senderId === meId ? "ml-auto bg-brand-600 text-white" : "bg-slate-100 text-ink-900"
            }`}
          >
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message..."
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
