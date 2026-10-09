"use client";
import { useRef, useState } from "react";

// A video thumbnail that plays a short muted preview clip on hover,
// falling back to the poster image.
export default function PreviewThumb({
  poster,
  preview,
  className = ""
}: {
  poster?: string;
  preview?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => {
        setHover(true);
        videoRef.current?.play().catch(() => {});
      }}
      onMouseLeave={() => {
        setHover(false);
        videoRef.current?.pause();
      }}
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={poster}
          className={`h-full w-full object-cover transition-opacity ${hover && preview ? "opacity-0" : "opacity-100"}`}
        />
      )}
      {preview && (
        <video
          ref={videoRef}
          src={preview}
          muted
          loop
          playsInline
          preload="none"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${hover ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
