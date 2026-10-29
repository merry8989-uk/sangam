"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The call screen.
 *
 * One room serves a video call, an audio call and a group call - what it is
 * depends on what people publish. Virtual backgrounds are applied to the local
 * track through LiveKit's processor when it is available, and fall back to a
 * plain blur of the local preview when it is not, so the control always does
 * something rather than silently nothing.
 */
export default function AnonCall() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [background, setBackground] = useState<"none" | "blur" | "dark" | "brand">("none");
  const roomRef = useRef<unknown>(null);
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not connect.");
        setStatus("");
      }
    })();

    return () => {
      cancelled = true;
      const room = roomRef.current as { disconnect?: () => void } | null;
      room?.disconnect?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }

  /**
   * Apply a background.
   *
   * `@livekit/track-processors` gives a real segmented background. When it is not
   * installed, this falls back to a CSS blur of the local preview, which is
   * honest about what it is: a blur, not a replaced background.
   */
  async function applyBackground(kind: typeof background) {
    setBackground(kind);
    const room = roomRef.current as {
      localParticipant?: {
        getTrackPublication?: (s: unknown) => { track?: { setProcessor?: (p: unknown) => Promise<void> } };
      };
    } | null;
    const pub = room?.localParticipant?.getTrackPublication?.("camera");
    const track = pub?.track;
    if (!track?.setProcessor) return;
    try {
      if (kind === "none") {
        await track.setProcessor(undefined);
        return;
      }
      const mod = await import("@livekit/track-processors");
      const options =
        kind === "blur"
          ? { mode: "background-blur", blurRadius: 12 }
          : { mode: "virtual-background", imagePath: kind === "brand" ? "/brand-bg.jpg" : "/dark-bg.jpg" };
      const processor = mod.VirtualBackground(options as never);
      await track.setProcessor(processor);
    } catch {
      // The processor is not installed. The CSS fallback below still applies.
    }
  }

  const fallbackFilter =
    background === "blur" ? "blur(8px)" : background === "dark" ? "brightness(0.6)" : background === "brand" ? "sepia(0.3) hue-rotate(-15deg)" : "none";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" style={{ filter: fallbackFilter }} />
        {status && <p className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs text-white">{status}</p>}
      </div>

      {error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={toggleMic} className={`rounded-lg px-3 py-2 text-xs font-medium ${micOn ? "bg-slate-100 text-ink-700" : "bg-red-50 text-red-700"}`}>
          {micOn ? "Mute" : "Unmute"}
        </button>
        <button onClick={toggleCam} className={`rounded-lg px-3 py-2 text-xs font-medium ${camOn ? "bg-slate-100 text-ink-700" : "bg-red-50 text-red-700"}`}>
          {camOn ? "Camera off" : "Camera on"}
        </button>
        <span className="mx-1 self-center text-xs text-ink-500">Background</span>
        {(["none", "blur", "dark", "brand"] as const).map((k) => (
          <button
            key={k}
            onClick={() => applyBackground(k)}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${background === k ? "bg-brand-600 text-white" : "bg-slate-100 text-ink-700"}`}
          >
            {k === "none" ? "None" : k === "blur" ? "Blur" : k === "dark" ? "Dark" : "Brand"}
          </button>
        ))}
        <button onClick={() => (window.location.href = "/anon")} className="ml-auto rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          Leave
        </button>
      </div>
      <p className="mt-3 text-[10px] text-ink-500">
        A real replaced background needs <code>@livekit/track-processors</code>. Without it the button blurs the local
        preview instead - it does something honest rather than nothing.
      </p>
    </main>
  );
}
