"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Anonymous chat.
 *
 * Two keys, and the difference is the whole feature:
 *
 *   your fixed key   permanent. A chat opened with it stays until someone
 *                    deletes it.
 *   a temporary key  you choose how long it lives. When it runs out the key is
 *                    destroyed and the chat is deleted from both sides.
 *
 * Nothing here shows a name. There is no name to show - that is the point - so a
 * chat is titled by its mode and how long it has left.
 */

type Chat = {
  id: string;
  kind: string;
  mode: string;
  label: string;
  remaining: string;
  memberCount: number;
  last: { body: string | null; kind: string; createdAt: string } | null;
};

type Attachment = {
  id: string;
  storageKey: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
};

type Message = {
  id: string;
  senderId: string;
  kind: string;
  body: string | null;
  createdAt: string;
  attachments: Attachment[];
};

type Preset = { seconds: number; label: string };

export default function AnonChat() {
  const [fixedKey, setFixedKey] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMeta, setChatMeta] = useState<{ label: string; remaining: string; mode: string; isOwner: boolean } | null>(null);
  const [joinKey, setJoinKey] = useState("");
  const [duration, setDuration] = useState(3600);
  const [minted, setMinted] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<{ key: string; name: string; mimeType: string; sizeBytes: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ---- load ----
  const loadChats = useCallback(async () => {
    try {
      const res = await fetch("/api/anon/chat");
      if (!res.ok) return;
      setChats(((await res.json()) as { items: Chat[] }).items ?? []);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [k, o] = await Promise.all([fetch("/api/anon/key"), fetch("/api/anon/temp-key")]);
        if (k.ok) setFixedKey(((await k.json()) as { key: string }).key);
        if (o.ok) {
          const d = (await o.json()) as { presets: Preset[] };
          setPresets(d.presets ?? []);
          if (d.presets?.length) setDuration(d.presets[4]?.seconds ?? 3600);
        }
      } catch {
        /* not signed in */
      }
      await loadChats();
    })();
  }, [loadChats]);

  const loadChat = useCallback(async (id: string) => {
    setBusy("load");
    setError(null);
    try {
      const res = await fetch(`/api/anon/chat/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 410) {
        setError("This chat has expired and was deleted.");
        setOpenChat(null);
        await loadChats();
        return;
      }
      if (!res.ok) {
        setError("Could not open that chat.");
        return;
      }
      setChatMeta(data.chat);
      setMessages(data.messages ?? []);
      setOpenChat(id);
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 50);
    } finally {
      setBusy(null);
    }
  }, [loadChats]);

  // ---- actions ----
  async function mint() {
    setBusy("mint");
    setError(null);
    setMinted(null);
    try {
      const res = await fetch("/api/anon/temp-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create a key.");
        return;
      }
      setMinted(data.key.key);
      setNotice("Key created. Send it to whoever you want to talk to - it works once and dies when the time is up.");
    } finally {
      setBusy(null);
    }
  }

  async function startChat() {
    const key = joinKey.trim();
    if (!key) return;
    setBusy("start");
    setError(null);
    try {
      const res = await fetch("/api/anon/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That key does not open a chat.");
        return;
      }
      setJoinKey("");
      await loadChats();
      await loadChat(data.chat.id);
    } finally {
      setBusy(null);
    }
  }

  async function attach(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy("upload");
    setError(null);
    const added: typeof files = [];
    try {
      for (const file of Array.from(selected).slice(0, 10 - files.length)) {
        const pres = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" })
        });
        if (!pres.ok) throw new Error("presign failed");
        const { key, url } = (await pres.json()) as { key: string; url: string };
        const put = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!put.ok) throw new Error("upload failed");
        added.push({ key, name: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size });
      }
      setFiles((f) => [...f, ...added].slice(0, 10));
    } catch {
      setError("That file did not upload.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!openChat) return;
    if (!draft.trim() && files.length === 0) return;
    setBusy("send");
    setError(null);
    try {
      const res = await fetch(`/api/anon/chat/${openChat}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() || undefined, attachments: files })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send that.");
        return;
      }
      setDraft("");
      setFiles([]);
      setMessages((m) => [...m, data as Message]);
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
    } finally {
      setBusy(null);
    }
  }

  async function startCall(video: boolean) {
    if (!openChat) return;
    setBusy("call");
    setError(null);
    try {
      const res = await fetch(`/api/anon/chat/${openChat}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start a call.");
        return;
      }
      // The call screen lives at /anon/call so the chat stays mounted behind it.
      window.location.href = `/anon/call?token=${encodeURIComponent(data.token)}&ws=${encodeURIComponent(data.wsUrl)}&video=${video ? 1 : 0}`;
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    if (!openChat) return;
    if (!confirm("Delete this chat for everyone? This cannot be undone.")) return;
    setBusy("delete");
    try {
      await fetch(`/api/anon/chat/${openChat}`, { method: "DELETE" });
      setOpenChat(null);
      setMessages([]);
      await loadChats();
      setNotice("Chat deleted.");
    } finally {
      setBusy(null);
    }
  }

  // ---- render ----
  if (openChat) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setOpenChat(null); setMessages([]); setFiles([]); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700">
            Back
          </button>
          <span className="text-sm font-semibold text-ink-900">{chatMeta?.label}</span>
          {chatMeta?.mode === "TEMPORARY" && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {chatMeta.remaining}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={() => startCall(true)} disabled={busy === "call"} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white">
              Video call
            </button>
            <button onClick={() => startCall(false)} disabled={busy === "call"} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700">
              Audio call
            </button>
            {chatMeta?.isOwner && (
              <button onClick={destroy} disabled={busy === "delete"} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                Delete
              </button>
            )}
          </div>
        </div>

        {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

        <div ref={listRef} className="max-h-[50vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
          {messages.length === 0 && <p className="text-xs text-ink-500">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-ink-500">{new Date(m.createdAt).toLocaleString("en-IN")}</p>
              {m.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-900">{m.body}</p>}
              {m.attachments.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {m.attachments.map((a) => (
                    <li key={a.id}>
                      <a href={`/api/media/${a.storageKey}`} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">
                        {a.name} · {Math.round(a.sizeBytes / 1024)} KB
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[10px] text-ink-400">sent · cannot be edited</p>
            </div>
          ))}
        </div>

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((f) => (
              <li key={f.key} className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1 text-xs text-ink-700">
                {f.name}
                <button onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))} className="text-red-600">×</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="cursor-pointer rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-ink-700">
            Attach
            <input type="file" multiple className="hidden" onChange={(e) => attach(e.target.files)} />
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write something. Once sent it cannot be edited."
            rows={2}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button onClick={send} disabled={busy === "send" || busy === "upload"} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white">
            Send
          </button>
        </div>
        <p className="text-[10px] text-ink-500">
          Any file type: documents, PDFs, images, video, audio, gifs, stickers, links. Messages cannot be edited after sending.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">{notice}</p>}

      {/* your fixed key */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-ink-900">Your permanent key</h2>
        <p className="mt-1 text-xs text-ink-500">
          Share this and anyone can start a chat with you. A chat opened with it stays until one of you deletes it.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm text-ink-900">{fixedKey ?? "…"}</code>
          <button onClick={() => fixedKey && navigator.clipboard.writeText(fixedKey)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700">
            Copy
          </button>
        </div>
      </section>

      {/* a temporary key */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-ink-900">A temporary key</h2>
        <p className="mt-1 text-xs text-ink-500">
          Choose how long it lives. When the time is up the key is destroyed and the chat is deleted from both sides - not
          hidden, deleted. Ten seconds at the least.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {presets.map((p) => (
              <option key={p.seconds} value={p.seconds}>{p.label}</option>
            ))}
          </select>
          <button onClick={mint} disabled={busy === "mint"} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
            Create key
          </button>
        </div>
        {minted && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-amber-50 px-3 py-1.5 font-mono text-sm text-amber-900">{minted}</code>
            <button onClick={() => navigator.clipboard.writeText(minted)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-ink-700">
              Copy
            </button>
          </div>
        )}
      </section>

      {/* open a chat */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-ink-900">Open a chat with a key</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={joinKey}
            onChange={(e) => setJoinKey(e.target.value)}
            placeholder="SGX-… or SGT-…"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm"
          />
          <button onClick={startChat} disabled={busy === "start"} className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white">
            Open
          </button>
        </div>
      </section>

      {/* the list */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="px-4 pt-4 text-sm font-semibold text-ink-900">Your chats</h2>
        {chats.length === 0 ? (
          <p className="p-4 text-xs text-ink-500">No chats yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {chats.map((c) => (
              <li key={c.id}>
                <button onClick={() => loadChat(c.id)} className="flex w-full items-center gap-2 p-3 text-left hover:bg-slate-50">
                  <span className="flex-1">
                    <span className="block text-sm text-ink-900">{c.label}</span>
                    <span className="block text-[10px] text-ink-500">
                      {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                      {c.mode === "TEMPORARY" ? ` · ${c.remaining}` : " · permanent"}
                    </span>
                  </span>
                  <span className="text-[10px] text-ink-400">{c.mode === "TEMPORARY" ? "temp" : "permanent"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
