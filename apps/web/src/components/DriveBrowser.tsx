"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
  starred: boolean;
  trashedAt: string | null;
  sourceUrl: string | null;
};

const ICON: Record<string, string> = {
  FOLDER: "folder",
  FILE: "file",
  NOTE: "note",
  SHEET: "sheet",
  DOC: "doc",
  SLIDES: "slides",
  LINK: "link"
};

function humanSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export default function DriveBrowser({
  items,
  parentId,
  crumbs
}: {
  items: Item[];
  parentId: string | null;
  crumbs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function create(kind: "FOLDER" | "NOTE" | "SHEET" | "DOC" | "SLIDES") {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, parentId })
      });
      if (!res.ok) {
        setError("Could not create that.");
        return;
      }
      const data = await res.json();
      setMenu(false);
      router.push(`/drive/${data.item.id}`);
    } finally {
      setBusy(null);
    }
  }

  // Upload any file: presign, PUT straight to storage, then register it.
  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy("UPLOAD");
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const pres = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size })
        });
        if (!pres.ok) {
          setError(file.size > 512 * 1024 * 1024 ? "That file is larger than 512 MB." : "Upload was refused.");
          continue;
        }
        const { key, url } = await pres.json();
        const put = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!put.ok) {
          setError(`Could not upload ${file.name}.`);
          continue;
        }
        await fetch("/api/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "FILE", name: file.name, parentId, storageKey: key, mimeType: file.type, sizeBytes: file.size })
        });
      }
      setMenu(false);
      router.refresh();
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const filtered = q
    ? items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))
    : items;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <Link href="/drive" className="rounded px-1.5 py-0.5 hover:bg-slate-100">
            My Drive
          </Link>
          {crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-ink-500">/</span>
              <Link href={`/drive/${c.id}`} className="rounded px-1.5 py-0.5 hover:bg-slate-100">
                {c.name}
              </Link>
            </span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            placeholder="Search in Drive"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-lg leading-none text-white hover:bg-brand-700"
              title="New"
            >
              +
            </button>
            {menu ? (
              <div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {(
                  [
                    ["FOLDER", "New folder"],
                    ["NOTE", "New note"],
                    ["SHEET", "New sheet"],
                    ["DOC", "New document"],
                    ["SLIDES", "New slides"]
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    onClick={() => create(kind)}
                    disabled={busy !== null}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busy === kind ? "Creating..." : label}
                  </button>
                ))}
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={busy !== null}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50"
                >
                  {busy === "UPLOAD" ? "Uploading..." : "Upload a file"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-ink-500">
          Nothing here yet. Use the + button to add a note, a sheet, a document, slides, a folder, or upload any file.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const card = (
              <>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                    {ICON[item.kind] ?? item.kind.toLowerCase()}
                  </span>
                  {item.starred ? <span className="text-xs text-brand-600">starred</span> : null}
                </div>
                <p className="mt-2 truncate font-medium">{item.name}</p>
                <p className="text-xs text-ink-500">
                  {item.mimeType || item.kind.toLowerCase()}
                  {item.sizeBytes ? ` - ${humanSize(item.sizeBytes)}` : ""}
                </p>
              </>
            );
            // A link item opens the external page; everything else opens here.
            return item.kind === "LINK" && item.sourceUrl ? (
              <a
                key={item.id}
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-600"
              >
                {card}
              </a>
            ) : (
              <Link
                key={item.id}
                href={`/drive/${item.id}`}
                className="rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-600"
              >
                {card}
              </Link>
            );
          })}

        </div>
      )}
    </div>
  );
}
