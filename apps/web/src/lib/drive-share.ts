import { randomBytes } from "crypto";

export const SHARE_ROLES = ["VIEWER", "EDITOR"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const ACCESS_LEVELS = ["OWNER", "EDIT", "VIEW", "NONE"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

// Link tokens are unguessable, and long enough that guessing is hopeless.
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export function shareLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/share/${token}`;
}

export type AccessInput = {
  isOwner: boolean;
  // The best share that applies to the viewer, if any.
  share: { role: string; expiresAt?: Date | string | null } | null;
  now?: Date;
};

// What the viewer may do with an item. A share is ignored once it expires.
export function resolveAccess(input: AccessInput): AccessLevel {
  if (input.isOwner) return "OWNER";

  const share = input.share;
  if (!share) return "NONE";

  if (share.expiresAt) {
    const exp = share.expiresAt instanceof Date ? share.expiresAt : new Date(share.expiresAt);
    const now = input.now ?? new Date();
    if (Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) return "NONE";
  }

  if (share.role === "EDITOR") return "EDIT";
  if (share.role === "VIEWER") return "VIEW";
  return "NONE";
}

// Who may write: the owner and editors.
export function canWrite(level: AccessLevel): boolean {
  return level === "OWNER" || level === "EDIT";
}

// Who may read: anyone except someone with no access.
export function canRead(level: AccessLevel): boolean {
  return level !== "NONE";
}

// Only the owner manages sharing and deletion.
export function canManage(level: AccessLevel): boolean {
  return level === "OWNER";
}

export function expiresAtFromDays(days: number | null | undefined, now = new Date()): Date | null {
  if (!days || days <= 0) return null;
  const capped = Math.min(days, 3650);
  return new Date(now.getTime() + capped * 24 * 60 * 60 * 1000);
}

// Given every share that applies to a viewer (the item plus its ancestors),
// pick the strongest one. An editor share beats a viewer share; expired shares
// are ignored entirely.
export function bestShareLevel<
  T extends { id: string; role: string; itemId: string; expiresAt?: Date | string | null }
>(shares: T[], now = new Date()): { level: AccessLevel; share: T } | null {
  const rank = (role: string) => (role === "EDITOR" ? 2 : role === "VIEWER" ? 1 : 0);
  const valid = shares
    .map((s) => ({ s, level: resolveAccess({ isOwner: false, share: s, now }) }))
    .filter((x) => x.level !== "NONE")
    .sort((a, b) => rank(b.s.role) - rank(a.s.role));
  if (valid.length === 0) return null;
  return { level: valid[0].level, share: valid[0].s };
}
