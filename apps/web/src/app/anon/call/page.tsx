"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The call screen.
 *
 * One room serves a video call, an audio call and a group call - what it is
 * depends on what people publish, not on a different endpoint.
 *
 * Virtual backgrounds are real: a `BackgroundProcessor` from
 * `@livekit/track-processors` segments the person from the room and replaces what
 * is behind them. It is attached in `disabled` mode as soon as the camera is on
 * and switched with `switchTo`, which is what the library recommends - calling
 * `setProcessor` on every change tears the pipeline down and back up, and you see
 * it happen.
 *
 * Where the browser cannot run the processor, the buttons say so rather than
 * doing nothing, and the local preview falls back to a plain CSS blur. A control
 * that silently does nothing is worse than one that explains itself.
 */

type Background = "none" | "blur" | "dark" | "brand";

const BACKGROUND_IMAGES: Record<Exclude<Background, "none" | "blur">, string> = {
  dark: "/anon-bg-dark.png",
  brand: "/anon-bg-brand.png"
};

type Processor = {
  switchTo: (opts: { mode: string; blurRadius?: number; imagePath?: string }) => Promise<void>;
};

type VideoTrack = {
  setProcessor?: (p: unknown) => Promise<void>;
  stopProcessor?: () => Promise<void>;
};

export default function AnonCall() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<unknown>(null);
  const processorRef = useRef<Processor | null>(null);
  const trackRef = useRef<VideoTrack | null>(null);

  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [background, setBackground] = useState<Background>("none");
  const [supported, setSupported] = useState<boolean | null>(null);

  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;

  useEffect(() => {
    const token = params?.get("token") ?? "";
    const ws = params?.get("ws") ?? "";
    const wantVideo = params?.get("video") !== "0";
    if (!token || !ws) {
      setError("No call token. Start the call from the chat.");
      setStatus("");
      return;
    }
    setCamOn(wantVideo);

    let cancelled = false;
    (async () => {
      try {
        const { Room, RoomEvent, Track } = await import("livekit-client");
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track: { kind: string; attach: (el: HTMLVideoElement) => void }) => {
          if (track.kind === Track.Kind.Video && videoRef.current) track.attach(videoRef.current);
        });
        room.on(RoomEvent.Disconnected, () => setStatus("Call ended."));

        await room.connect(ws, token);
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.localParticipant.setCameraEnabled(wantVideo);
        if (cancelled) return;
        setStatus("Connected");

        // Attach the processor up front, in disabled mode, so the first switch is
        // instant and does not tear the pipeline down.
        if (wantVideo) await attachProcessor();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect.");
        setStatus("");
      }
    })();

    return () => {
      cancelled = true;
      const room = roomRef.current as { disconnect?: () => void } | null;
      room?.disconnect?.();
      void trackRef.current?.stopProcessor?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Put a disabled processor on the local camera, ready to switch. */
  async function attachProcessor() {
    try {
      const mod = await import("@livekit/track-processors");
      if (!mod.supportsBackgroundProcessors()) {
        setSupported(false);
        return;
      }
      setSupported(true);

      const room = roomRef.current as {
        localParticipant?: {
          getTrackPublication?: (source: unknown) => { videoTrack?: VideoTrack } | undefined;
          videoTrackPublications?: Map<unknown, { videoTrack?: VideoTrack }>;
        };
      } | null;
      const { Track } = await import("livekit-client");
      const pub =
        room?.localParticipant?.getTrackPublication?.(Track.Source.Camera) ??
        [...(room?.localParticipant?.videoTrackPublications?.values() ?? [])][0];
      const track = pub?.videoTrack;
      if (!track?.setProcessor) {
        setSupported(false);
        return;
      }
      trackRef.current = track;
      const processor = mod.BackgroundProcessor({ mode: "disabled" }) as unknown as Processor;
      await track.setProcessor(processor);
      processorRef.current = processor;
    } catch {
      // The package is not installed, or the browser cannot run it.
      setSupported(false);
    }
  }

  async function applyBackground(kind: Background) {
    setBackground(kind);
    const processor = processorRef.current;
    if (!processor) return;
    try {
      if (kind === "none") {
        await processor.switchTo({ mode: "disabled" });
      } else if (kind === "blur") {
        await processor.switchTo({ mode: "background-blur", blurRadius: 12 });
      } else {
        await processor.switchTo({ mode: "virtual-background", imagePath: BACKGROUND_IMAGES[kind] });
      }
    } catch {
      setError("That background could not be applied.");
      setBackground("none");
    }
  }

  async function toggleMic() {
    const room = roomRef.current as { localParticipant?: { setMicrophoneEnabled: (v: boolean) => Promise<void> } } | null;
    const next = !micOn;
    setMicOn(next);
    await room?.localParticipant?.setMicrophoneEnabled(next).catch(() => {});
  }

  async function toggleCam() {
    const room = roomRef.current as { localParticipant?: { setCameraEnabled: (v: boolean) => Promise<void> } } | null;
    const next = !camOn;
    setCamOn(next);
    await room?.localParticipant?.setCameraEnabled(next).catch(() => {});
    // The processor follows the camera: a fresh track needs it attached again.
    if (next) setTimeout(() => void attachProcessor(), 400);
  }

  // Only used when the processor cannot run, so the button does something
  // honest rather than nothing.
  const fallbackFilter =
    supported === false
      ? background === "blur"
        ? "blur(8px)"
        : background === "dark"
          ? "brightness(0.6)"
          : background === "brand"
            ? "sepia(0.3) hue-rotate(-15deg)"
            : "none"
      : "none";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full object-cover"
          style={{ filter: fallbackFilter }}
        />
        {status && <p className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">{status}</p>}
      </div>

      {error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={toggleMic}
          className={`rounded-lg px-3 py-2 text-xs font-medium ${micOn ? "bg-slate-100 text-ink-700" : "bg-red-50 text-red-700"}`}
        >
          {micOn ? "Mute" : "Unmute"}
        </button>
        <button
          onClick={toggleCam}
          className={`rounded-lg px-3 py-2 text-xs font-medium ${camOn ? "bg-slate-100 text-ink-700" : "bg-red-50 text-red-700"}`}
        >
          {camOn ? "Camera off" : "Camera on"}
        </button>

        <span className="mx-1 self-center text-xs text-ink-500">Background</span>
        {(["none", "blur", "dark", "brand"] as const).map((k) => (
          <button
            key={k}
            onClick={() => applyBackground(k)}
            disabled={supported === false}
            title={supported === false ? "This browser cannot replace the background" : undefined}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${
              background === k ? "bg-brand-600 text-white" : "bg-slate-100 text-ink-700"
            } ${supported === false ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {k === "none" ? "None" : k === "blur" ? "Blur" : k === "dark" ? "Dark room" : "Brand"}
          </button>
        ))}

        <button onClick={() => (window.location.href = "/anon")} className="ml-auto rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          Leave
        </button>
      </div>

      <p className="mt-3 text-[10px] text-ink-500">
        {supported === false
          ? "This browser cannot run the background processor, so the buttons are off and Blur only softens your own preview. Chrome or Edge on desktop can replace the background properly."
          : "The background is replaced on your own track, before it leaves the device - the other side sees it, and your room is never sent."}
      </p>
    </main>
  );
}
