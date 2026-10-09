"use client";
import { useEffect, useRef } from "react";

export type SkipMark = { startSec: number; endSec: number };

// Plays an HLS stream. Uses native HLS where the browser supports it
// (Safari/iOS) and hls.js everywhere else (Chrome/Firefox/Edge).
// When `skipEnabled` is on, marked segments are skipped as playback reaches them.
export default function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  segments = [],
  skipEnabled = false
}: {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  segments?: SkipMark[];
  skipEnabled?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: { destroy: () => void } | undefined;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const instance = new Hls();
          instance.loadSource(src);
          instance.attachMedia(video);
          hls = instance;
        } else {
          video.src = src;
        }
      });
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [src]);

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

  return (
    <video
      ref={ref}
      controls
      playsInline
      poster={poster}
      autoPlay={autoPlay}
      className={className}
    />
  );
}
