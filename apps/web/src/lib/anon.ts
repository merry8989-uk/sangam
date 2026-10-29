/**
 * Anonymous chat: the keys, the durations, and the rule that a temporary chat
 * really goes away.
 *
 * Two ways in, and the difference is the whole feature:
 *
 *   the fixed key      one per account, permanent. A chat opened with it is a
 *                      normal chat - it stays until someone deletes it.
 *   a temporary key    minted for one chat, with a duration the user picks.
 *                      When it expires the key is destroyed and the chat is
 *                      deleted from both sides - not hidden, not archived.
 *
 * Kept pure so the key format, the duration bounds and the expiry arithmetic can
 * be tested without a database. The deletion itself lives in the sweeper; this
 * file decides what "expired" means, so there is one answer.
 */

import { randomBytes } from "crypto";

// ------------------------------------------------------------------ keys

/**
 * Crockford base32: no I, L, O or U. A key gets read out loud, typed from a
 * screenshot and copied by hand, so the characters that get confused are gone.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A fixed key starts with this, so a user can tell the two apart at a glance. */
export const FIXED_KEY_PREFIX = "SGX";
/** A temporary key starts with this. */
export const TEMP_KEY_PREFIX = "SGT";

/** 12 characters of base32 is 60 bits. Long enough that guessing is not a plan. */
export const KEY_BODY_LENGTH = 12;
/** Shown in groups of four: SGX-7K2M-4P9Q-R3TV. */
export const KEY_GROUP = 4;

function encode(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

/** The body of a key: base32, grouped in fours. */
export function newKeyBody(length = KEY_BODY_LENGTH): string {
  // One random byte per character is wasteful but simple and unbiased enough
  // for a 60-bit key; the modulo bias on 32 is nil because 256 is a multiple.
  const body = encode(randomBytes(length));
  return body.match(new RegExp(`.{1,${KEY_GROUP}}`, "g"))?.join("-") ?? body;
}

/** A permanent, shareable handle. One per account. */
export function newFixedKey(): string {
  return `${FIXED_KEY_PREFIX}-${newKeyBody()}`;
}

/** A key for one chat, which will be destroyed. */
export function newTempKey(): string {
  return `${TEMP_KEY_PREFIX}-${newKeyBody()}`;
}

export type KeyKind = "FIXED" | "TEMP" | "UNKNOWN";

export function keyKind(key: string): KeyKind {
  const k = (key ?? "").trim().toUpperCase();
  if (k.startsWith(FIXED_KEY_PREFIX + "-")) return "FIXED";
  if (k.startsWith(TEMP_KEY_PREFIX + "-")) return "TEMP";
  return "UNKNOWN";
}

/** Does this look like a key we issued? Checked before any database lookup. */
export function isWellFormedKey(key: string): boolean {
  const k = (key ?? "").trim().toUpperCase();
  if (keyKind(k) === "UNKNOWN") return false;
  const body = k.slice(4);
  if (!new RegExp(`^([${ALPHABET}]{${KEY_GROUP}}-){2}[${ALPHABET}]{${KEY_GROUP}}$`).test(body)) {
    return false;
  }
  return true;
}

/** Normalised for lookup: upper case, trimmed. Stored and compared this way. */
export function normaliseKey(key: string): string {
  return (key ?? "").trim().toUpperCase();
}

// -------------------------------------------------------------- durations

/** Ten seconds. Below this a chat is not a conversation. */
export const MIN_TEMP_SECONDS = 10;
/** Thirty days. Above this it is not temporary. */
export const MAX_TEMP_SECONDS = 30 * 24 * 60 * 60;

export type TempPreset = { seconds: number; label: string };

/** The durations offered in the picker, in seconds, with a label. */
export const TEMP_PRESETS: TempPreset[] = [
  { seconds: 10, label: "10 seconds" },
  { seconds: 60, label: "1 minute" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 1800, label: "30 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 7200, label: "2 hours" },
  { seconds: 21600, label: "6 hours" },
  { seconds: 86400, label: "1 day" },
  { seconds: 604800, label: "7 days" },
];

export type DurationResult =
  | { ok: true; seconds: number }
  | { ok: false; reason: "not a number" | "too short" | "too long" };

/**
 * Turn what a user typed into seconds.
 *
 * Accepts a bare number of seconds, or a number with a unit: `10`, `10s`, `5m`,
 * `2h`, `1d`. The picker sends seconds, so this is for the "as per their choice"
 * path where someone types their own.
 */
export function parseDuration(input: unknown): DurationResult {
  if (typeof input === "number") return clampDuration(input);
  if (typeof input !== "string") return { ok: false, reason: "not a number" };

  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, reason: "not a number" };

  const m = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/.exec(
    raw
  );
  if (!m) return { ok: false, reason: "not a number" };

  const value = Number(m[1]);
  if (!Number.isFinite(value)) return { ok: false, reason: "not a number" };

  const unit = m[2] ?? "s";
  const multiplier = unit.startsWith("d")
    ? 86400
    : unit.startsWith("h")
      ? 3600
      : unit.startsWith("m")
        ? 60
        : 1;

  return clampDuration(Math.round(value * multiplier));
}

export function clampDuration(seconds: number): DurationResult {
  if (!Number.isFinite(seconds)) return { ok: false, reason: "not a number" };
  const s = Math.round(seconds);
  if (s < MIN_TEMP_SECONDS) return { ok: false, reason: "too short" };
  if (s > MAX_TEMP_SECONDS) return { ok: false, reason: "too long" };
  return { ok: true, seconds: s };
}

/** When a chat minted now with this duration expires. */
export function expiresAtFrom(seconds: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + seconds * 1000);
}

// ---------------------------------------------------------------- expiry

export type ChatMode = "TEMPORARY" | "PERMANENT";

/**
 * The mode a chat gets, from the kind of key that opened it. A fixed key gives a
 * permanent chat; a temporary key gives one that will be deleted.
 */
export function modeForKey(kind: KeyKind): ChatMode | null {
  if (kind === "FIXED") return "PERMANENT";
  if (kind === "TEMP") return "TEMPORARY";
  return null;
}

/**
 * Has this chat expired?
 *
 * A permanent chat never does - `expiresAt` is null and that is the whole
 * difference. A temporary one expires the moment the clock passes it, whether or
 * not the sweeper has run yet; a read must not show a chat that should be gone
 * just because the sweep is a minute away.
 */
export function isExpired(
  chat: { mode: string; expiresAt: Date | null },
  now: Date = new Date()
): boolean {
  if (chat.mode === "PERMANENT") return false;
  if (!chat.expiresAt) return false;
  return chat.expiresAt.getTime() <= now.getTime();
}

/** How long is left, in seconds. Zero when it is past. */
export function secondsRemaining(expiresAt: Date | null, now: Date = new Date()): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

/** "1h 20m left", "45s left", "expired". For a header, so it is short. */
export function describeRemaining(expiresAt: Date | null, now: Date = new Date()): string {
  if (!expiresAt) return "does not expire";
  const s = secondsRemaining(expiresAt, now);
  if (s <= 0) return "expired";
  if (s < 60) return `${s}s left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m left`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h left`;
}

/** The duration as a person would say it. For a settings label. */
export function describeDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

// ------------------------------------------------------------ attachments

export const ATTACHMENT_KINDS = [
  "IMAGE", "VIDEO", "AUDIO", "GIF", "STICKER", "DOCUMENT", "ARCHIVE", "OTHER"
] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Anything can be sent. This only decides how it is shown. */
export function attachmentKind(mimeType: string, name = ""): AttachmentKind {
  const m = (mimeType ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  if (m === "image/gif" || n.endsWith(".gif")) return "GIF";
  if (m.startsWith("image/")) return n.includes("sticker") ? "STICKER" : "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  if (m.startsWith("audio/")) return "AUDIO";
  if (
    m.includes("pdf") ||
    m.startsWith("text/") ||
    m.includes("word") ||
    m.includes("excel") ||
    m.includes("spreadsheet") ||
    m.includes("presentation") ||
    m.includes("officedocument") ||
    n.endsWith(".pdf") || n.endsWith(".doc") || n.endsWith(".docx") ||
    n.endsWith(".xls") || n.endsWith(".xlsx") || n.endsWith(".csv")
  ) {
    return "DOCUMENT";
  }
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar") || n.endsWith(".zip") || n.endsWith(".rar")) {
    return "ARCHIVE";
  }
  return "OTHER";
}

/** A 200 MB ceiling. Above this the app asks for a link instead. */
export const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

// -------------------------------------------------------------- messages

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * A message is written once and never changed.
 *
 * This exists as a function rather than a comment because the requirement is
 * explicit - "make sure there is no edit chat or text once send" - and a rule
 * that lives only in a doc gets broken by the next person adding a PATCH route.
 * There is no update path in the API; this is the second lock.
 */
export function canEditMessage(): false {
  return false;
}

export type MessageInput =
  | { ok: true; kind: "TEXT"; body: string }
  | { ok: true; kind: "FILE"; body: string | null }
  | { ok: true; kind: "LINK"; body: string }
  | { ok: false; reason: string };

/** Validate what is about to be sent. */
export function validateMessage(input: {
  body?: unknown;
  attachmentCount?: number;
}): MessageInput {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const count = input.attachmentCount ?? 0;

  if (count > MAX_ATTACHMENTS_PER_MESSAGE) {
    return { ok: false, reason: `at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments` };
  }
  if (!body && count === 0) return { ok: false, reason: "empty message" };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "message is too long" };
  if (count > 0) return { ok: true, kind: "FILE", body: body || null };
  if (isLinkOnly(body)) return { ok: true, kind: "LINK", body };
  return { ok: true, kind: "TEXT", body };
}

/** A message that is nothing but a URL. Shown as a link card. */
export function isLinkOnly(body: string): boolean {
  return /^https?:\/\/\S+$/i.test(body.trim());
}

/**
 * The chat title, as the viewer should see it.
 *
 * Anonymous means anonymous: a direct chat is titled by its mode and age, not by
 * the other person's name, because there is no name to show.
 */
export function chatLabel(chat: {
  kind: string;
  mode: string;
  title: string | null;
  expiresAt: Date | null;
}, now: Date = new Date()): string {
  if (chat.title) return chat.title;
  if (chat.kind === "GROUP") return "Group chat";
  return chat.mode === "TEMPORARY" ? `Temporary chat · ${describeRemaining(chat.expiresAt, now)}` : "Chat";
}

/** Everything a chat screen needs to know, in one place. */
export function chatState(chat: {
  mode: string;
  status: string;
  expiresAt: Date | null;
}, now: Date = new Date()): { live: boolean; expired: boolean; reason: string } {
  if (chat.status === "DELETED") return { live: false, expired: false, reason: "deleted" };
  if (chat.status === "EXPIRED") return { live: false, expired: true, reason: "expired" };
  if (isExpired(chat, now)) return { live: false, expired: true, reason: "expired" };
  return { live: true, expired: false, reason: chat.mode === "TEMPORARY" ? "temporary" : "permanent" };
}
