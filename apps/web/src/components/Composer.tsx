"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function Composer({
  groupId,
  defaultVisibility = "PUBLIC"
}: {
  groupId?: string;
  defaultVisibility?: string;
} = {}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function kindOf(f: File): "IMAGE" | "VIDEO" | "AUDIO" {
    if (f.type.startsWith("video")) return "VIDEO";
    if (f.type.startsWith("audio")) return "AUDIO";
    return "IMAGE";
  }

  // Poll until the background transcoding finishes.
  async function pollStatus(postId: string) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/posts/${postId}/status`);
        if (!res.ok) break;
        const d = await res.json();
        if (d.status === "READY") {
          setStatus("Video ready.");
          break;
        }
        if (d.status === "FAILED") {
          setStatus("Video processing failed.");
          break;
        }
        setStatus("Processing video...");
      } catch {
        break;
      }
    }
    router.refresh();
  }

  async function submit() {
    if (!caption.trim() && !file) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const media: unknown[] = [];
      if (file) {
        const contentType = file.type || "application/octet-stream";
        const kind = kindOf(file);

        const pres = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType, kind })
        });
        if (!pres.ok) throw new Error("Could not start upload");
        const { key, url } = (await pres.json()) as { key: string; url: string };

        const put = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file
        });
        if (!put.ok) throw new Error("Upload to storage failed");

        media.push({ key, kind, mimeType: contentType, sizeBytes: file.size });
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          type: file ? kindOf(file) : "TEXT",
          visibility: defaultVisibility,
          media,
          ...(groupId ? { groupId } : {})
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create post");

      setCaption("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setBusy(false);

      if (data.processing && data.post?.id) {
        setStatus("Processing video...");
        await pollStatus(data.post.id);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Share something..."
        rows={3}
        className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-ink-500"
          />
          {status && <span className="text-xs text-brand-700">{status}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
