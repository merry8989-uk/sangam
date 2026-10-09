import { randomBytes } from "crypto";

export const ROOM_KINDS = ["CALL", "MEETING", "LIVE"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

// No 0/O or 1/I, so a code can be read aloud without confusion.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newJoinCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export type JoinDecision = { ok: boolean; role: "HOST" | "SPEAKER" | "VIEWER"; reason?: string };

// Who may join a room, and as what. A join code counts as an invitation, so
// private calls still work for the people the host shared the code with.
export function canJoinRoom(input: {
  kind: string;
  visibility: string;
  isOwner: boolean;
  followsOwner: boolean;
  viewerId: string | null;
  hasJoinCode: boolean;
}): JoinDecision {
  if (input.isOwner) return { ok: true, role: "HOST" };
  if (!input.viewerId) return { ok: false, role: "VIEWER", reason: "Sign in to join." };

  const role: JoinDecision["role"] = input.kind === "LIVE" ? "VIEWER" : "SPEAKER";

  if (input.hasJoinCode) return { ok: true, role };
  if (input.visibility === "PUBLIC") return { ok: true, role };
  if (input.visibility === "FOLLOWERS") {
    return input.followsOwner
      ? { ok: true, role }
      : { ok: false, role: "VIEWER", reason: "Only followers can join." };
  }
  return { ok: false, role: "VIEWER", reason: "This room is private. Ask the host for the code." };
}

// May the viewer publish audio/video (as opposed to only watching)?
export function canPublish(role: string, kind: string): boolean {
  if (kind === "LIVE") return role === "HOST" || role === "SPEAKER";
  return role === "HOST" || role === "SPEAKER";
}
