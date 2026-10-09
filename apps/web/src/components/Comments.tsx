"use client";
import { useEffect, useState } from "react";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { username: string; displayName: string };
};

export default function Comments({ postId }: { postId: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/comments?postId=${postId}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => {});
  }, [postId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId, body })
    });
    setBusy(false);
    if (res.ok) {
      const c = await res.json();
      setItems((prev) => [...prev, c]);
      setBody("");
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Comments</h2>
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-sm text-ink-500">No comments yet.</li>}
        {items.map((c) => (
          <li key={c.id} className="text-sm">
            <span className="font-medium">@{c.author.username}</span>{" "}
            <span className="text-ink-700">{c.body}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 flex gap-2">
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
