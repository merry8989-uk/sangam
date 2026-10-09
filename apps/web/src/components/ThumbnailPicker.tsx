"use client";
import { useState } from "react";
import { mediaUrl } from "@/lib/s3";

type Frame = { atSec: number; key: string };

// Lets the author choose the poster frame for their video.
export default function ThumbnailPicker({
  mediaId,
  initialThumbnailKey
}: {
  mediaId: string;
  initialThumbnailKey?: string | null;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [current, setCurrent] = useState<string | null>(initialThumbnailKey ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadFrames() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/frames?count=8`);
      if (!res.ok) {
        setError("Could not generate frames.");
        return;
      }
      const data = await res.json();
      setFrames(data.frames ?? []);
      setOpen(true);
    } catch {
      setError("Could not generate frames.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(atSec: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/poster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atSec })
      });
      if (!res.ok) {
        setError("Could not set the poster.");
        return;
      }
      const data = await res.json();
      setCurrent(data.thumbnailKey);
      setOpen(false);
    } catch {
      setError("Could not set the poster.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-ink-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Thumbnail</p>
          <p className="text-xs text-ink-500">Pick the frame people see before they play.</p>
        </div>
        <button
          type="button"
          onClick={loadFrames}
          disabled={busy}
          className="rounded-md border border-ink-100 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {busy ? "Working..." : open ? "Refresh frames" : "Choose a frame"}
        </button>
      </div>

      {current ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={mediaUrl(current)} className="mt-3 h-24 w-40 rounded-md object-cover" />
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {open && frames.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {frames.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => choose(f.atSec)}
              disabled={busy}
              className="overflow-hidden rounded-md border border-ink-100 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={mediaUrl(f.key)} className="h-16 w-full object-cover" />
              <span className="block py-1 text-[11px] text-ink-500">{f.atSec}s</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
