"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { policySummary, type HistoryPolicy, type HistoryType } from "@/lib/history";

type WatchItem = {
  id: string;
  at: string;
  archived: boolean;
  post: { id: string; caption: string | null; author: { username: string }; media: { thumbnailKey: string | null }[] };
};
type SearchItem = { id: string; query: string; at: string; archived: boolean };

type Tab = "watch" | "search" | "archive";

/**
 * Watch and search history, with the controls to manage it.
 *
 * Everything is fetched from /api/history, which reads Postgres - so what you
 * see here is what is stored, not a cache that may have expired.
 */
export default function HistoryManager() {
  const [tab, setTab] = useState<Tab>("watch");
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [search, setSearch] = useState<SearchItem[]>([]);
  const [archivedWatch, setArchivedWatch] = useState<WatchItem[]>([]);
  const [archivedSearch, setArchivedSearch] = useState<SearchItem[]>([]);
  const [policies, setPolicies] = useState<Record<HistoryType, HistoryPolicy> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s, aw, as] = await Promise.all([
        fetch("/api/history?type=watch").then((r) => r.json()),
        fetch("/api/history?type=search").then((r) => r.json()),
        fetch("/api/history?type=watch&archived=1").then((r) => r.json()),
        fetch("/api/history?type=search&archived=1").then((r) => r.json())
      ]);
      setWatch(w.items ?? []);
      setSearch(s.items ?? []);
      setArchivedWatch(aw.items ?? []);
      setArchivedSearch(as.items ?? []);
      if (w.policy && s.policy) setPolicies({ watch: w.policy, search: s.policy });
    } catch {
      setNote("Could not load your history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(type: HistoryType, id: string, op: "archive" | "restore" | "delete") {
    setBusy(true);
    setNote(null);
    try {
      const res =
        op === "delete"
          ? await fetch(`/api/history/${id}?type=${type}`, { method: "DELETE" })
          : await fetch(`/api/history/${id}?type=${type}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ archived: op === "archive" })
            });
      if (!res.ok) throw new Error("failed");
      await load();
    } catch {
      setNote("That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function clear(type: HistoryType) {
    const label = type === "watch" ? "watch" : "search";
    if (!window.confirm(`Delete all of your ${label} history? This cannot be undone.`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/history?type=${type}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      await load();
    } catch {
      setNote("Could not clear that.");
    } finally {
      setBusy(false);
    }
  }

  const archiveRows = [
    ...archivedWatch.map((i) => ({ type: "watch" as const, item: i })),
    ...archivedSearch.map((i) => ({ type: "search" as const, item: i }))
  ].sort((a, b) => new Date(b.item.at).getTime() - new Date(a.item.at).getTime());

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "watch", label: "Watch", count: watch.length },
    { id: "search", label: "Search", count: search.length },
    { id: "archive", label: "Archive", count: archiveRows.length }
  ];

  const activePolicy = tab === "search" ? policies?.search : policies?.watch;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-brand-600 text-white" : "bg-slate-100 text-ink-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1 opacity-70">{t.count}</span>}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-500">
          {busy ? "Working..." : loading ? "Loading..." : ""}
        </span>
      </div>

      {note && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{note}</p>}

      {/* The policy that is actually in force, read from the stored settings. */}
      {activePolicy && tab !== "archive" && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-500">
          {tab === "watch" ? "Watch history" : "Search history"}: {policySummary(activePolicy)}. Change
          this in <Link href="/settings" className="underline">Settings</Link>.
        </p>
      )}

      {tab !== "archive" && (
        <div className="mb-4">
          <button
            onClick={() => clear(tab)}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-ink-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Clear {tab === "watch" ? "watch" : "search"} history
          </button>
        </div>
      )}

      {tab === "archive" && archiveRows.length === 0 && (
        <p className="text-ink-500">
          Nothing is archived. Items land here when your policy is set to archive them.
        </p>
      )}

      <ul className="space-y-2">
        {tab === "watch" &&
          watch.map((i) => (
            <Row
              key={i.id}
              href={`/post/${i.post.id}`}
              thumb={i.post.media[0]?.thumbnailKey ?? null}
              title={i.post.caption || "(no title)"}
              sub={`@${i.post.author.username} · ${new Date(i.at).toLocaleString("en-IN")}`}
              onArchive={() => act("watch", i.id, "archive")}
              onDelete={() => act("watch", i.id, "delete")}
              busy={busy}
            />
          ))}

        {tab === "search" &&
          search.map((i) => (
            <Row
              key={i.id}
              title={i.query}
              sub={new Date(i.at).toLocaleString("en-IN")}
              onArchive={() => act("search", i.id, "archive")}
              onDelete={() => act("search", i.id, "delete")}
              busy={busy}
            />
          ))}

        {tab === "archive" &&
          archiveRows.map(({ type, item }) =>
            type === "watch" ? (
              <Row
                key={`w-${item.id}`}
                href={`/post/${(item as WatchItem).post.id}`}
                thumb={(item as WatchItem).post.media[0]?.thumbnailKey ?? null}
                title={(item as WatchItem).post.caption || "(no title)"}
                sub={`@${(item as WatchItem).post.author.username} · archived`}
                onRestore={() => act("watch", item.id, "restore")}
                onDelete={() => act("watch", item.id, "delete")}
                busy={busy}
              />
            ) : (
              <Row
                key={`s-${item.id}`}
                title={(item as SearchItem).query}
                sub="archived"
                onRestore={() => act("search", item.id, "restore")}
                onDelete={() => act("search", item.id, "delete")}
                busy={busy}
              />
            )
          )}
      </ul>

      {!loading && tab === "watch" && watch.length === 0 && (
        <p className="text-ink-500">Nothing here yet.</p>
      )}
      {!loading && tab === "search" && search.length === 0 && (
        <p className="text-ink-500">No searches recorded.</p>
      )}
    </div>
  );
}

function Row({
  href,
  thumb,
  title,
  sub,
  onArchive,
  onRestore,
  onDelete,
  busy
}: {
  href?: string;
  thumb?: string | null;
  title: string;
  sub: string;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const body = (
    <>
      {thumb !== undefined && (
        <span className="h-12 w-20 shrink-0 overflow-hidden rounded bg-slate-200">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-full w-full object-cover" src={`/api/media/${thumb}`} />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-ink-500">{sub}</span>
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-200 px-2 py-2">
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      <span className="flex shrink-0 gap-1">
        {onArchive && (
          <button
            onClick={onArchive}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-ink-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Archive
          </button>
        )}
        {onRestore && (
          <button
            onClick={onRestore}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-ink-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Restore
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
