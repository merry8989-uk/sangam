import { LIVEKIT_API_URL, mintAdminToken, livekitConfigured } from "./livekit";

// LiveKit's server API is Twirp over HTTP. We call it directly rather than
// pulling in the server SDK.
function httpBase(): string {
  if (!LIVEKIT_API_URL) return "";
  return LIVEKIT_API_URL.replace(/^ws/, "http").replace(/\/$/, "");
}

async function twirp<T>(service: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${httpBase()}/twirp/livekit.${service}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mintAdminToken()}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`LiveKit ${service}.${method} failed: ${res.status}`);
  return (await res.json()) as T;
}

export type IngressInfo = {
  ingress_id: string;
  url: string;
  stream_key: string;
  // Present when transcoding is on: the HLS URL viewers can watch.
  hls_playlist_url?: string;
};

// Create an RTMP ingress so a phone or laptop can push a stream to us.
export async function createIngress(roomName: string, identity: string, name: string): Promise<IngressInfo> {
  if (!livekitConfigured()) throw new Error("LiveKit is not configured");
  return twirp<IngressInfo>("Ingress", "CreateIngress", {
    input_type: "RTMP_INPUT",
    name: `${roomName} ingress`,
    room_name: roomName,
    participant_identity: identity,
    participant_name: name,
    enable_transcoding: true
  });
}

export async function deleteIngress(ingressId: string): Promise<void> {
  if (!livekitConfigured()) return;
  await twirp("Ingress", "DeleteIngress", { ingress_id: ingressId });
}

// Force a room closed on the media server.
export async function deleteRoom(roomName: string): Promise<void> {
  if (!livekitConfigured()) return;
  try {
    await twirp("RoomService", "DeleteRoom", { room: roomName });
  } catch {
    // The room may already be empty; that is fine.
  }
}
