import { randomUUID } from "crypto";

export const DRIVE_KINDS = ["FOLDER", "FILE", "NOTE", "SHEET", "DOC", "SLIDES", "LINK"] as const;
export type DriveKind = (typeof DRIVE_KINDS)[number];

// Documents you write inside the app (as opposed to uploaded bytes).
export const EDITABLE_KINDS = ["NOTE", "SHEET", "DOC", "SLIDES"] as const;

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512 MB
export const MAX_NAME_LEN = 160;

export type UploadKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "ARCHIVE" | "OTHER";

// Everything the drive accepts. Kept permissive on purpose: the point is that
// almost any file can be stored.
const BY_MIME: { test: RegExp; kind: UploadKind }[] = [
  { test: /^image\//, kind: "IMAGE" },
  { test: /^video\//, kind: "VIDEO" },
  { test: /^audio\//, kind: "AUDIO" },
  { test: /^text\/|pdf|json|xml|csv|epub|msword|officedocument|opendocument|rtf|markdown/, kind: "DOCUMENT" },
  { test: /zip|tar|gzip|rar|7z|x-bzip/, kind: "ARCHIVE" }
];

export function classifyUpload(mimeType: string): UploadKind {
  const m = (mimeType || "").toLowerCase();
  for (const { test, kind } of BY_MIME) if (test.test(m)) return kind;
  return "OTHER";
}

// Strip path separators and control characters, keep it short.
export function sanitizeName(name: string): string {
  const cleaned = (name || "")
    .replace(/[\\/]+/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (cleaned || "Untitled").slice(0, MAX_NAME_LEN);
}

// A file extension for the storage key, so the object keeps its type.
export function extensionFor(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "bin";
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(ext) ? ext : "bin";
}

export function newStorageKey(ownerId: string, filename: string): string {
  return `drive/${ownerId}/${randomUUID()}.${extensionFor(filename)}`;
}

export function defaultContentFor(kind: string): string {
  if (kind === "SHEET") {
    return JSON.stringify({ cols: 6, rows: 24, cells: {} });
  }
  if (kind === "SLIDES") {
    return JSON.stringify({ slides: [{ title: "Untitled", body: "" }] });
  }
  if (kind === "DOC") {
    return "# Untitled document\n\n";
  }
  return "";
}

export function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

// A folder cannot be moved inside itself or one of its own descendants.
// `ancestorIds` is the chain from the target folder up to the root (the target
// itself included), so a move is a cycle exactly when the item appears in it.
export function canMoveTo(itemId: string, targetParentId: string | null, ancestorIds: string[]): boolean {
  if (targetParentId === null) return true;
  if (itemId === targetParentId) return false;
  return !ancestorIds.includes(itemId);
}

export function withinQuota(usedBytes: number, addingBytes: number, quotaBytes = 15 * 1024 * 1024 * 1024): boolean {
  return usedBytes + addingBytes <= quotaBytes;
}
