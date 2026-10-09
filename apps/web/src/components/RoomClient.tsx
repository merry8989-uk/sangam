"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant } from "livekit-client";

type JoinResponse = {
  role: "HOST" | "SPEAKER" | "VIEWER";
  roomName: string;
  token: string | null;
  wsUrl: string | null;
  canPublish?: boolean;
  warning?: string;
};

// One client for calls, meetings and live streams. What you can do is decided
// by the role the server hands back.
export default function RoomClient({
  roomId,
  joinCode,
  kind
}: {
  roomId: string;
  joinCode?: string;
  kind: string;
}) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [canPublish, setCanPublish] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<{ id: string; name: string }[]>([]);
  const [participantCount, setParticipantCount] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const localScreen = useRef<HTMLVideoElement>(null);

  const attachLocal = useCallback((participant: LocalParticipant) => {
    const cam = participant.getTrackPublication(Track.Source.Camera);
    const mic = participant.getTrackPublication(Track.Source.Microphone);
    const screen = participant.getTrackPublication(Track.Source.ScreenShare);
    if (cam?.track && localVideo.current) cam.track.attach(localVideo.current);
    if (screen?.track && localScreen.current) screen.track.attach(localScreen.current);
    setCamOn(Boolean(cam?.track));
    setMicOn(Boolean(mic?.track));
    setSharing(Boolean(screen?.track));
  }, []);

  const sync = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setParticipantCount(room.numParticipants + 1);
    const list = Array.from(room.remoteParticipants.values()).map((p: RemoteParticipant) => ({
      id: p.identity,
      name: p.name || p.identity
    }));
    setRemotes(list);
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode ?? "" })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not join this room.");
        setStatus("error");
        return;
      }
      const data = (await res.json()) as JoinResponse;
      setRole(data.role);
      setCanPublish(Boolean(data.canPublish));

      if (!data.token || !data.wsUrl) {
        setError(data.warning ?? "LiveKit is not configured on the server.");
        setStatus("error");
        return;
      }

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room
        .on(RoomEvent.ParticipantConnected, sync)
        .on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.TrackSubscribed, sync)
        .on(RoomEvent.LocalTrackPublished, () => attachLocal(room.localParticipant))
        .on(RoomEvent.LocalTrackUnpublished, () => attachLocal(room.localParticipant))
        .on(RoomEvent.Disconnected, () => setStatus("idle"));

      await room.connect(data.wsUrl, data.token);
      if (data.canPublish) {
        await room.localParticipant.enableCameraAndMicrophone().catch(() => {});
      }
      attachLocal(room.localParticipant);
      setStatus("live");
      sync();
    } catch {
      setError("Could not reach the media server.");
      setStatus("error");
    }
  }, [roomId, joinCode, sync, attachLocal]);

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  async function toggleMic() {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (micOn) await lp.setMicrophoneEnabled(false);
    else await lp.setMicrophoneEnabled(true);
    setMicOn(!micOn);
  }
  async function toggleCam() {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (camOn) await lp.setCameraEnabled(false);
    else await lp.setCameraEnabled(true);
    setCamOn(!camOn);
  }
  async function toggleScreen() {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (sharing) await lp.setScreenShareEnabled(false);
    else await lp.setScreenShareEnabled(true);
    setSharing(!sharing);
  }
  function leave() {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setStatus("idle");
  }

  if (status === "idle" || status === "error") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
        {kind === "LIVE" ? (
          <p className="text-sm text-ink-500">Watch this stream, or go live from your phone or laptop.</p>
        ) : (
          <p className="text-sm text-ink-500">Join this room to start talking.</p>
        )}
        <button onClick={connect} className="mt-3 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
          {kind === "LIVE" ? "Watch live" : "Join room"}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-brand-50 px-2 py-1 text-brand-700">{role}</span>
        <span className="text-ink-500">{participantCount} in the room</span>
        {status === "connecting" && <span className="text-ink-500">connecting...</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {canPublish ? (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={localVideo} autoPlay playsInline muted className="h-56 w-full object-cover" />
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">You</span>
          </div>
        ) : null}
        {remotes.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            {r.name}
          </div>
        ))}
        {sharing ? (
          <div className="overflow-hidden rounded-xl bg-black md:col-span-2">
            <video ref={localScreen} autoPlay playsInline muted className="h-64 w-full object-contain" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {canPublish ? (
          <>
            <button onClick={toggleMic} className={`rounded-lg border px-4 py-2 text-sm ${micOn ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300"}`}>
              {micOn ? "Mic on" : "Mic off"}
            </button>
            <button onClick={toggleCam} className={`rounded-lg border px-4 py-2 text-sm ${camOn ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300"}`}>
              {camOn ? "Camera on" : "Camera off"}
            </button>
            <button onClick={toggleScreen} className={`rounded-lg border px-4 py-2 text-sm ${sharing ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300"}`}>
              {sharing ? "Stop sharing" : "Share screen"}
            </button>
          </>
        ) : null}
        <button onClick={leave} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-red-600">
          Leave
        </button>
      </div>
    </div>
  );
}
