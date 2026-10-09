"use client";
import { useEffect, useMemo, useState } from "react";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  author: { username: string };
};

const MAX_DEPTH = 6;

export default function Comments({
  postId,
  threaded = true,
  sort = "top"
}: {
  postId: string;
  threaded?: boolean;
  sort?: string;
}) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/comments?postId=${postId}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
  }, [postId]);

  const sorted = useMemo(() => {
    const c = [...items];
    if (sort === "new") c.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    else if (sort === "old") c.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return c;
  }, [items, sort]);

  // A comment whose parent is missing (deleted) surfaces at the root rather
  // than disappearing.
  const present = new Set(sorted.map((c) => c.id));
  const childrenOf = (parentId: string | null) =>
    sorted.filter((c) => {
      const p = c.parentId ?? null;
      if (parentId === null) return p === null || !present.has(p);
      return p === parentId;
    });

  async function send(text: string, parentId: string | null) {
    if (!text.trim()) return;
    setBusy(true);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, body: text, ...(parentId ? { parentId } : {}) })
    });
    setBusy(false);
    if (res.ok) {
      const c = await res.json();
      setItems((prev) => [...prev, c]);
    }
  }

  function Node({ c, depth }: { c: Comment; depth: number }) {
    const kids = childrenOf(c.id);
    return (
      <li className={depth > 0 ? "border-l-2 border-slate-200 pl-3" : ""}>
        <div className="py-1 text-sm">
          <span className="font-medium">@{c.author.username}</span>{" "}
          <span className="text-ink-700">{c.body}</span>
        </div>
        <button
          onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
          className="text-xs text-ink-500 hover:underline"
        >
          Reply
        </button>
        {replyTo === c.id && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(replyBody, c.id);
              setReplyBody("");
              setReplyTo(null);
            }}
            className="mt-2 flex gap-2"
          >
            <input
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={`Reply to @${c.author.username}`}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white">Reply</button>
          </form>
        )}
        {threaded && depth < MAX_DEPTH && kids.length > 0 && (
          <ul className="mt-1 space-y-1">
            {kids.map((k) => (
              <Node key={k.id} c={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenOf(null);

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Comments</h2>
      {items.length === 0 && <p className="text-sm text-ink-500">No comments yet.</p>}

      {threaded ? (
        <ul className="space-y-1">
          {roots.map((c) => (
            <Node key={c.id} c={c} depth={0} />
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {sorted.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">@{c.author.username}</span>{" "}
              <span className="text-ink-700">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(body, null);
          setBody("");
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
