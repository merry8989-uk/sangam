"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Results = {
  users: { id: string; username: string; displayName: string }[];
  tags: { tag: string; _count: { posts: number } }[];
  posts: { id: string; caption: string | null; author: { username: string } }[];
};

const EMPTY: Results = { users: [], tags: [], posts: [] };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>(EMPTY);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(EMPTY);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        setRes(await r.json());
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Search</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="People, hashtags, posts..."
        className="w-full rounded-lg border border-slate-300 px-4 py-2"
      />

      {res.users.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-500">People</h2>
          <ul className="space-y-1">
            {res.users.map((u) => (
              <li key={u.id}>
                <Link href={`/profile/${u.username}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
                  <span className="font-medium">@{u.username}</span>{" "}
                  <span className="text-sm text-ink-500">{u.displayName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {res.tags.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-500">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {res.tags.map((t) => (
              <Link key={t.tag} href={`/tag/${encodeURIComponent(t.tag)}`}
                    className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
                #{t.tag} · {t._count.posts}
              </Link>
            ))}
          </div>
        </section>
      )}

      {res.posts.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-500">Posts</h2>
          <ul className="space-y-1">
            {res.posts.map((p) => (
              <li key={p.id}>
                <Link href={`/post/${p.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
                  <span className="text-sm text-ink-500">@{p.author.username}</span>{" "}
                  <span>{p.caption}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {q.trim().length >= 2 &&
        res.users.length + res.tags.length + res.posts.length === 0 && (
          <p className="mt-6 text-ink-500">No results for &ldquo;{q}&rdquo;.</p>
        )}
    </main>
  );
}
