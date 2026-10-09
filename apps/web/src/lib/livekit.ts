import { createHmac, timingSafeEqual } from "crypto";

// LiveKit access tokens are plain HS256 JWTs, so we mint them here with
// node:crypto instead of pulling in an SDK - same approach as the Meilisearch
// and S3 integrations elsewhere in this repo.
const API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

// Public websocket URL handed to clients, e.g. wss://live.example.in
export const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";

// Server-to-server address. In Docker this is the service name, which the
// browser cannot reach, so it is kept separate from the client URL.
export const LIVEKIT_API_URL = process.env.LIVEKIT_API_URL || LIVEKIT_URL;

export function livekitConfigured(): boolean {
  return Boolean(API_KEY && API_SECRET && LIVEKIT_URL);
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(head: string, body: string): string {
  return createHmac("sha256", API_SECRET).update(`${head}.${body}`).digest("base64url");
}

export type VideoGrant = {
  roomJoin: boolean;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  roomAdmin?: boolean;
  roomCreate?: boolean;
  roomList?: boolean;
};

export type TokenClaims = {
  iss: string;
  sub: string;
  nbf: number;
  exp: number;
  jti: string;
  name?: string;
  video: VideoGrant;
};

// One room per Room row; the id is stable and unguessable.
export function roomNameFor(roomId: string): string {
  return `sangam_${roomId}`;
}

export function mintToken(opts: {
  identity: string;
  name?: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData?: boolean;
  roomAdmin?: boolean;
  ttlSec?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims: TokenClaims = {
    iss: API_KEY,
    sub: opts.identity,
    nbf: now - 10,
    exp: now + (opts.ttlSec ?? 3600),
    jti: opts.identity,
    name: opts.name,
    video: {
      roomJoin: true,
      room: opts.room,
      canPublish: opts.canPublish,
      canSubscribe: opts.canSubscribe,
      canPublishData: opts.canPublishData ?? true,
      ...(opts.roomAdmin ? { roomAdmin: true } : {})
    }
  };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(claims));
  return `${head}.${body}.${sign(head, body)}`;
}

// Server-to-server token for the LiveKit RoomService / Ingress APIs.
export function mintAdminToken(ttlSec = 600): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    iss: API_KEY,
    sub: API_KEY,
    nbf: now - 10,
    exp: now + ttlSec,
    jti: `admin_${now}`,
    video: { roomJoin: false, room: "", canPublish: false, canSubscribe: false, canPublishData: false, roomAdmin: true, roomCreate: true, roomList: true }
  };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(claims));
  return `${head}.${body}.${sign(head, body)}`;
}

// Verify a token's signature and expiry. Used by tests and by any server-side
// check that wants to trust a token it did not just mint.
export function verifyToken(token: string): TokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = sign(head, body);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenClaims;
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
