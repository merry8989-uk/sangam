"use client";
import { useEffect, useRef } from "react";

// Plays an HLS stream. Uses native HLS where the browser supports it
// (Safari/iOS) and hls.js everywhere else (Chrome/Firefox/Edge).
export default function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false
}: {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
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
