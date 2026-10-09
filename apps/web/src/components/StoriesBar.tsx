"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Story = { id: string; caption?: string; url: string; kind: string; createdAt: string };
type Group = { author: { username: string; displayName: string }; stories: Story[] };

export default function StoriesBar() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [viewer, setViewer] = useState<{ gi: number; si: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/stories");
      const d = await r.json();
      setGroups(d.groups ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // auto-advance the viewer every 5 seconds
  useEffect(() => {
    if (!viewer) return;
    const t = setTimeout(() => advance(1), 5000);
    return () => clearTimeout(t);
  }, [viewer, groups]);

  function advance(dir: number) {
    setViewer((v) => {
      if (!v) return v;
      const g = groups[v.gi];
      const nextIndex = v.si + dir;
      if (nextIndex >= 0 && nextIndex < g.stories.length) return { gi: v.gi, si: nextIndex };
      const nextGroup = v.gi + dir;
      if (nextGroup >= 0 && nextGroup < groups.length) return { gi: nextGroup, si: 0 };
      return null;
    });
  }

  async function addStory(file: File) {
    setBusy(true);
    try {
      const contentType = file.type || "application/octet-stream";
      const kind = file.type.startsWith("video") ? "VIDEO" : "IMAGE";
      const pres = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType, kind })
      });
      if (!pres.ok) return;
      const { key, url } = await pres.json();
      const put = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!put.ok) return;
      await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaKey: key, kind, mimeType: contentType, sizeBytes: file.size })
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const current = viewer ? groups[viewer.gi]?.stories[viewer.si] : null;

  return (
    <>
      <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex w-16 shrink-0 flex-col items-center gap-1"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-brand-500 text-2xl text-brand-600">
            +
          </span>
          <span className="text-[11px] text-ink-500">{busy ? "..." : "Add"}</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addStory(f);
            e.target.value = "";
          }}
        />

        {groups.map((g, gi) => (
          <button
            key={g.author.username}
            onClick={() => setViewer({ gi, si: 0 })}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <span className="h-16 w-16 overflow-hidden rounded-full border-2 border-brand-500 p-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="h-full w-full rounded-full object-cover" src={g.stories[0]?.url} />
            </span>
            <span className="w-16 truncate text-center text-[11px] text-ink-500">
              {g.author.username}
            </span>
          </button>
        ))}
      </div>

      {viewer && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <button
            onClick={() => setViewer(null)}
            className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-1 text-sm text-white"
          >
            Close
          </button>
          <button onClick={() => advance(-1)} className="absolute left-2 text-3xl text-white/70" aria-label="Previous">
            ‹
          </button>
          <div className="relative max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt="" className="max-h-[85vh] rounded-lg" />
            <div className="absolute bottom-0 w-full rounded-b-lg bg-black/50 p-3 text-sm text-white">
              <span className="font-medium">@{groups[viewer.gi].author.username}</span>
              {current.caption && <span className="ml-2 text-white/80">{current.caption}</span>}
            </div>
          </div>
          <button onClick={() => advance(1)} className="absolute right-2 text-3xl text-white/70" aria-label="Next">
            ›
          </button>
        </div>
      )}
    </>
  );
}
