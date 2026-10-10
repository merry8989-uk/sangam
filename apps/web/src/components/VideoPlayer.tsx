"use client";
import { useEffect, useRef, useState } from "react";
import { qualityLabel, type Rendition } from "@/lib/quality";

export type SkipMark = { startSec: number; endSec: number };

type HlsLike = {
  destroy: () => void;
  currentLevel: number;
  levels: { height: number }[];
};

// Plays an HLS stream. Uses native HLS where the browser supports it
// (Safari/iOS) and hls.js everywhere else (Chrome/Firefox/Edge).
// - `skipEnabled` skips marked segments as playback reaches them.
// - `cap` is the quality ceiling from the viewer's settings.
export default function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  segments = [],
  skipEnabled = false,
  variants = [],
  cap = null
}: {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  segments?: SkipMark[];
  skipEnabled?: boolean;
  variants?: Rendition[];
  cap?: number | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsLike | null>(null);
  const capRef = useRef<number | null>(cap);
  const [levels, setLevels] = useState<number[]>([]);
  const [level, setLevel] = useState<number>(-1);

  capRef.current = cap;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: HlsLike | undefined;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS: the browser adapts on its own, no level menu.
      video.src = src;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const instance = new Hls();
          instance.loadSource(src);
          instance.attachMedia(video);
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            const heights = (instance.levels ?? []).map((l) => l.height);
            setLevels(heights);
            const ceiling = capRef.current;
            if (ceiling !== null) {
              const idx = heights.findIndex((h) => h <= ceiling);
              if (idx >= 0) {
                instance.currentLevel = idx;
                setLevel(idx);
              }
            }
          });
          hlsRef.current = instance as unknown as HlsLike;
          hls = instance as unknown as HlsLike;
        } else {
          video.src = src;
        }
      });
    }

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  // Apply a changed ceiling without reloading the stream.
  useEffect(() => {
    const h = hlsRef.current;
    if (!h || levels.length === 0) return;
    if (cap === null) {
      h.currentLevel = -1;
      setLevel(-1);
      return;
    }
    const idx = levels.findIndex((x) => x <= cap);
    if (idx >= 0) {
      h.currentLevel = idx;
      setLevel(idx);
    }
  }, [cap, levels]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onTime = () => {
      if (!skipEnabled || segments.length === 0) return;
      const t = video.currentTime;
      const hit = segments.find((s) => t >= s.startSec && t < s.endSec - 0.15);
      if (hit) video.currentTime = hit.endSec;
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [segments, skipEnabled]);

  const choose = (idx: number) => {
    const h = hlsRef.current;
    if (!h) return;
    h.currentLevel = idx;
    setLevel(idx);
  };

  const heights = levels.length > 0 ? levels : variants.map((v) => v.height);

  return (
    <div className={className}>
      <video ref={ref} controls playsInline poster={poster} autoPlay={autoPlay} className="w-full rounded-xl bg-black" />
      {heights.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-500">Quality</span>
          <button
            type="button"
            onClick={() => choose(-1)}
            className={`rounded-md border px-2 py-1 ${
              level === -1 ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-100"
            }`}
          >
            Auto
          </button>
          {heights.map((h, i) => (
            <button
              key={h + "-" + i}
              type="button"
              onClick={() => choose(i)}
              className={`rounded-md border px-2 py-1 ${
                level === i ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-100"
              }`}
            >
              {qualityLabel(String(h))}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
