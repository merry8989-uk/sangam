"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mediaUrl } from "@/lib/s3";

type Item = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string | null;
  content: string;
};

type SheetData = { cols: number; rows: number; cells: Record<string, string> };
type SlidesData = { slides: { title: string; body: string }[] };

// A deliberately small markdown renderer: headings, bold, code, lists.
function renderMarkdown(md: string): string {
  const esc = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split("\n")
    .map((line) => {
      if (/^###\s+/.test(line)) return `<h3>${line.replace(/^###\s+/, "")}</h3>`;
      if (/^##\s+/.test(line)) return `<h2>${line.replace(/^##\s+/, "")}</h2>`;
      if (/^#\s+/.test(line)) return `<h1>${line.replace(/^#\s+/, "")}</h1>`;
      if (/^[-*]\s+/.test(line)) return `<li>${line.replace(/^[-*]\s+/, "")}</li>`;
      if (/^\s*$/.test(line)) return "";
      return `<p>${line}</p>`;
    })
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export default function DriveEditor({ item }: { item: Item }) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [content, setContent] = useState(item.content);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);

  const sheet = useMemo<SheetData | null>(() => {
    if (item.kind !== "SHEET") return null;
    try {
      const d = JSON.parse(content) as SheetData;
      return { cols: d.cols ?? 6, rows: d.rows ?? 24, cells: d.cells ?? {} };
    } catch {
      return { cols: 6, rows: 24, cells: {} };
    }
  }, [content, item.kind]);

  const slides = useMemo<SlidesData | null>(() => {
    if (item.kind !== "SLIDES") return null;
    try {
      const d = JSON.parse(content) as SlidesData;
      return { slides: d.slides?.length ? d.slides : [{ title: "Untitled", body: "" }] };
    } catch {
      return { slides: [{ title: "Untitled", body: "" }] };
    }
  }, [content, item.kind]);

  async function save(next?: { name?: string; content?: string }) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/drive/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next?.name ?? name, content: next?.content ?? content })
      });
      setStatus(res.ok ? "Saved" : "Could not save");
      if (res.ok) router.refresh();
    } catch {
      setStatus("Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function trash() {
    if (!confirm("Move this to the trash?")) return;
    const res = await fetch(`/api/drive/${item.id}`, { method: "DELETE" });
    if (res.ok) router.push("/drive");
  }

  function setCell(key: string, value: string) {
    if (!sheet) return;
    const next: SheetData = { ...sheet, cells: { ...sheet.cells, [key]: value } };
    const json = JSON.stringify(next);
    setContent(json);
  }

  function setSlide(i: number, patch: Partial<{ title: string; body: string }>) {
    if (!slides) return;
    const next = slides.slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    const json = JSON.stringify({ slides: next });
    setContent(json);
  }

  const isText = item.kind === "NOTE" || item.kind === "DOC";
  const mime = item.mimeType || "";
  const fileUrl = item.storageKey ? mediaUrl(item.storageKey) : "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/drive" className="text-sm text-ink-500 hover:underline">
          My Drive
        </Link>
        <span className="text-ink-500">/</span>
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-transparent px-2 py-1 text-lg font-semibold hover:border-slate-300 focus:border-slate-300"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => save({ name })}
        />
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-ink-500">{item.kind}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isText || item.kind === "SHEET" || item.kind === "SLIDES" ? (
          <button onClick={() => save()} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Saving..." : "Save"}
          </button>
        ) : null}
        {isText ? (
          <button onClick={() => setPreview((p) => !p)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            {preview ? "Edit" : "Preview"}
          </button>
        ) : null}
        {item.storageKey ? (
          <a href={fileUrl} download className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            Download
          </a>
        ) : null}
        <button onClick={trash} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-red-600">
          Move to trash
        </button>
        {status ? <span className="text-sm text-ink-500">{status}</span> : null}
      </div>

      <div className="mt-4">
        {isText ? (
          preview ? (
            <div
              className="prose max-w-none rounded-xl border border-slate-200 bg-white p-5 text-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          ) : (
            <textarea
              className="h-[60vh] w-full rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={item.kind === "DOC" ? "# Title\n\nWrite your document..." : "Write your note..."}
            />
          )
        ) : null}

        {sheet ? (
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {Array.from({ length: sheet.rows }).map((_, r) => (
                  <tr key={r}>
                    {Array.from({ length: sheet.cols }).map((__, c) => {
                      const key = `${r}:${c}`;
                      return (
                        <td key={key} className="border border-slate-200 p-0">
                          <input
                            className="w-full px-2 py-1 outline-none focus:bg-brand-50"
                            value={sheet.cells[key] ?? ""}
                            onChange={(e) => setCell(key, e.target.value)}
                            onBlur={() => save()}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {slides ? (
          <div className="space-y-3">
            {slides.slides.map((s, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <input
                  className="w-full text-lg font-semibold outline-none"
                  value={s.title}
                  placeholder="Slide title"
                  onChange={(e) => setSlide(i, { title: e.target.value })}
                  onBlur={() => save()}
                />
                <textarea
                  className="mt-2 h-24 w-full text-sm outline-none"
                  value={s.body}
                  placeholder="Slide body"
                  onChange={(e) => setSlide(i, { body: e.target.value })}
                  onBlur={() => save()}
                />
              </div>
            ))}
            <button
              onClick={() => {
                const next = JSON.stringify({ slides: [...slides.slides, { title: "Untitled", body: "" }] });
                setContent(next);
                save({ content: next });
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Add slide
            </button>
          </div>
        ) : null}

        {item.kind === "FILE" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={fileUrl} className="max-h-[70vh] w-auto rounded-lg" />
            ) : mime.startsWith("video/") ? (
              <video src={fileUrl} controls className="max-h-[70vh] w-full rounded-lg bg-black" />
            ) : mime.startsWith("audio/") ? (
              <audio src={fileUrl} controls className="w-full" />
            ) : mime.includes("pdf") ? (
              <iframe src={fileUrl} className="h-[70vh] w-full rounded-lg" title={item.name} />
            ) : mime.startsWith("text/") || mime.includes("json") ? (
              <iframe src={fileUrl} className="h-[70vh] w-full rounded-lg" title={item.name} />
            ) : (
              <p className="text-sm text-ink-500">
                No preview for this type. Use Download to open it.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
