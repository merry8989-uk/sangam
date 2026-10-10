import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || "http://10.0.2.2:3000";

const TOKEN_KEY = "sangam.token";
let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}
export async function setToken(t: string | null): Promise<void> {
  token = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}
export function hasToken(): boolean {
  return Boolean(token);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {})
  };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(BASE_URL + path, { ...init, headers });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()) as T;
}

export async function signIn(email: string, password: string) {
  const data = await api<{ token: string; user: { username: string } }>("/api/mobile/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  await setToken(data.token);
  return data;
}

export type Rendition = {
  height: number;
  width: number;
  bitrateK: number;
  playlistKey: string;
};

export type Post = {
  id: string;
  caption: string | null;
  type: string;
  createdAt: string;
  viewCount: number;
  author: { username: string; displayName: string };
  media: {
    id: string;
    kind: string;
    storageKey: string;
    thumbnailKey: string | null;
    hlsKey: string | null;
    previewKey: string | null;
    renditions: Rendition[];
  }[];
};

export const mediaUrl = (key: string) => BASE_URL + "/api/media/" + encodeURIComponent(key);

export type SkipSegment = {
  id: string;
  mediaId: string;
  startSec: number;
  endSec: number;
  category: string;
  visibility: "SELF" | "EVERYONE";
  upvotes: number;
  downvotes: number;
  authorId: string;
  authorName?: string;
  mine?: boolean;
};

export const SKIP_CATEGORIES = [
  "NONSENSE",
  "INTRO",
  "OUTRO",
  "SPONSOR",
  "SELF_PROMO",
  "MUSIC",
  "FILLER"
] as const;

export type SkipCategory = (typeof SKIP_CATEGORIES)[number];

export function getSkipSegments(mediaId: string) {
  return api<{ items: SkipSegment[] }>("/api/skip-points?mediaId=" + encodeURIComponent(mediaId));
}

export function createSkipSegment(input: {
  mediaId: string;
  startSec: number;
  endSec: number;
  category: SkipCategory;
  visibility: "SELF" | "EVERYONE";
}) {
  return api<{ segment: SkipSegment }>("/api/skip-points", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deleteSkipSegment(id: string) {
  return api<{ ok: boolean }>("/api/skip-points/" + id, { method: "DELETE" });
}

export function voteSkipSegment(id: string, value: 1 | -1) {
  return api<{ ok: boolean; vote: number }>("/api/skip-points/" + id + "/vote", {
    method: "POST",
    body: JSON.stringify({ value })
  });
}

// The viewer's quality ceiling: the stricter of video and audio quality.
export function playbackCap(videoQuality?: string | null, audioQuality?: string | null): number | null {
  const video = videoQuality && videoQuality !== "auto" ? Number(videoQuality) : null;
  const audio = audioQuality === "low" ? 480 : audioQuality === "medium" ? 720 : null;
  if (video === null) return audio;
  if (audio === null) return video;
  return Math.min(video, audio);
}

export type SampledFrame = { atSec: number; key: string };

export function getThumbnailFrames(mediaId: string, count = 8) {
  return api<{ frames: SampledFrame[]; durationMs: number }>(
    "/api/media/" + mediaId + "/frames?count=" + count
  );
}

export function setPoster(mediaId: string, atSec: number) {
  return api<{ thumbnailKey: string; atSec: number }>("/api/media/" + mediaId + "/poster", {
    method: "POST",
    body: JSON.stringify({ atSec })
  });
}

// ---- rooms: calls, meetings and live streams ----
export type RoomKind = "CALL" | "MEETING" | "LIVE";

export type RoomSummary = {
  id: string;
  kind: string;
  name: string;
  joinCode: string;
  status: string;
  visibility: string;
  isLive: boolean;
  hlsPlaybackUrl: string | null;
  startedAt: string;
  owner: { username: string; displayName: string | null };
};

export function createRoom(kind: RoomKind, visibility: "PRIVATE" | "FOLLOWERS" | "PUBLIC" = "PRIVATE") {
  return api<{ room: RoomSummary; rtmp?: { url: string; key: string } }>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ kind, visibility })
  });
}

export function listRooms(kind?: RoomKind) {
  return api<{ items: RoomSummary[]; livekitConfigured: boolean }>(
    "/api/rooms" + (kind ? "?kind=" + kind : "")
  );
}

export function joinRoom(roomId: string, code?: string) {
  return api<{
    role: string;
    roomName: string;
    token: string | null;
    wsUrl: string | null;
    canPublish?: boolean;
    warning?: string;
  }>("/api/rooms/" + roomId + "/join", {
    method: "POST",
    body: JSON.stringify({ code: code ?? "" })
  });
}

export function endRoom(roomId: string) {
  return api<{ ok: boolean }>("/api/rooms/" + roomId + "/end", { method: "POST" });
}

export function liveAction(roomId: string, action: "start" | "stop") {
  return api<{ room: RoomSummary; rtmp?: { url: string; key: string } }>(
    "/api/rooms/" + roomId + "/live",
    { method: "POST", body: JSON.stringify({ action }) }
  );
}

export function resolveJoinCode(code: string) {
  return api<{ room: RoomSummary }>("/api/rooms/code/" + encodeURIComponent(code.toUpperCase()));
}

// ---- drive: notes, documents, sheets, slides and any file ----
export type DriveKind = "FOLDER" | "FILE" | "NOTE" | "SHEET" | "DOC" | "SLIDES";

export type DriveItem = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string | null;
  content: string;
  starred: boolean;
  updatedAt: string;
};

export function listDrive(parentId?: string | null) {
  return api<{ items: DriveItem[]; parent: { id: string; name: string; parentId: string | null } | null }>(
    "/api/drive" + (parentId ? "?parentId=" + parentId : "")
  );
}

export function createDriveItem(kind: DriveKind, parentId?: string | null, name?: string) {
  return api<{ item: DriveItem }>("/api/drive", {
    method: "POST",
    body: JSON.stringify({ kind, parentId: parentId ?? null, name })
  });
}

export function getDriveItem(id: string) {
  return api<{ item: DriveItem }>("/api/drive/" + id);
}

export function updateDriveItem(id: string, patch: { name?: string; content?: string; starred?: boolean }) {
  return api<{ item: DriveItem }>("/api/drive/" + id, { method: "PATCH", body: JSON.stringify(patch) });
}

export function trashDriveItem(id: string) {
  return api<{ ok: boolean }>("/api/drive/" + id, { method: "DELETE" });
}

// Presign, PUT the bytes, then register the item.
export async function uploadToDrive(file: { uri: string; name: string; mimeType: string; size: number }, parentId?: string | null) {
  const pres = await api<{ key: string; url: string; kind: string }>("/api/drive/upload", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType: file.mimeType || "application/octet-stream", sizeBytes: file.size })
  });
  const blob = await (await fetch(file.uri)).blob();
  const put = await fetch(pres.url, {
    method: "PUT",
    headers: { "Content-Type": file.mimeType || "application/octet-stream" },
    body: blob
  });
  if (!put.ok) throw new Error("upload failed");
  return api<{ item: DriveItem }>("/api/drive", {
    method: "POST",
    body: JSON.stringify({
      kind: "FILE",
      name: file.name,
      parentId: parentId ?? null,
      storageKey: pres.key,
      mimeType: file.mimeType,
      sizeBytes: file.size
    })
  });
}

// ---- linked accounts (Terabox) ----
export type LinkedAccount = {
  id: string;
  provider: string;
  label: string;
  status: string;
  method: string;
  tokenHint: string | null;
};

export function listLinkedAccounts() {
  return api<{ accounts: LinkedAccount[]; terabox: { oauthAvailable: boolean } }>("/api/linked-accounts");
}

export function linkTerabox(input: { label?: string; token?: string }) {
  return api<{ account: LinkedAccount }>("/api/linked-accounts", {
    method: "POST",
    body: JSON.stringify({ provider: "TERABOX", label: input.label, token: input.token })
  });
}

export function unlinkAccount(id: string) {
  return api<{ ok: boolean }>("/api/linked-accounts/" + id, { method: "DELETE" });
}

export function importTeraboxLink(url: string, parentId?: string | null) {
  return api<{ item: DriveItem }>("/api/drive/import-link", {
    method: "POST",
    body: JSON.stringify({ url, parentId: parentId ?? null })
  });
}

// ---- Zoho WorkDrive ----
export type ZohoStatus = {
  configured: boolean;
  dc: string;
  accountsBase: string;
  linked: boolean;
  account: { id: string; label: string; apiDomain: string } | null;
};

export function zohoStatus() {
  return api<ZohoStatus>("/api/zoho/status");
}

export function zohoCreate(kind: "SHEET" | "DOC" | "SLIDES") {
  return api<{ item: DriveItem }>("/api/drive/zoho/create", {
    method: "POST",
    body: JSON.stringify({ kind })
  });
}

export function zohoList() {
  return api<{ files: { id: string; name: string; extn?: string; permalink?: string }[] }>("/api/drive/zoho/list");
}

// The WorkDrive upload is authenticated with the OAuth token, so it goes
// through our server rather than straight to storage.
export async function uploadToWorkDrive(file: { uri: string; name: string; mimeType: string }, parentId?: string | null) {
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  if (parentId) form.append("parentId", parentId);
  const headers: Record<string, string> = {};
  if (getToken()) headers.Authorization = "Bearer " + getToken();
  const res = await fetch(BASE_URL + "/api/drive/zoho/upload", { method: "POST", headers, body: form });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json()) as { item: DriveItem };
}

// Where to send the user to start the Zoho consent flow.
export function zohoConnectUrl() {
  return BASE_URL + "/api/zoho/connect";
}

// ---- drive sharing ----
export type DriveShare = {
  id: string;
  role: string;
  link: string | null;
  expiresAt: string | null;
  user: { id: string; username: string; displayName: string | null } | null;
};

export function listShares(itemId: string) {
  return api<{ shares: DriveShare[] }>("/api/drive/" + itemId + "/share");
}

export function createShare(
  itemId: string,
  input: { username?: string; role?: "VIEWER" | "EDITOR"; public?: boolean; expiresInDays?: number }
) {
  return api<{ share: DriveShare }>("/api/drive/" + itemId + "/share", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function revokeShare(shareId: string) {
  return api<{ ok: boolean }>("/api/drive/shares/" + shareId, { method: "DELETE" });
}

export function sharedWithMe() {
  return api<{ items: { shareId: string; role: string; item: DriveItem }[] }>("/api/drive/shared");
}

export const SIMPLE_UPLOAD_MAX = 250 * 1024 * 1024;

// Files above 250 MB go to WorkDrive's stream endpoint. expo-file-system
// uploads straight from disk, so a large video never enters JS memory.
export async function uploadLargeToWorkDrive(
  file: { uri: string; name: string; mimeType: string; size: number },
  parentId?: string | null
) {
  const headers: Record<string, string> = {
    "x-filename": encodeURIComponent(file.name),
    "x-size": String(file.size),
    "x-content-type": file.mimeType || "application/octet-stream"
  };
  const t = getToken();
  if (t) headers.Authorization = "Bearer " + t;
  if (parentId) headers["x-parent-id"] = parentId;

  const res = await FileSystem.uploadAsync(BASE_URL + "/api/drive/zoho/upload-large", file.uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers
  });
  if (res.status < 200 || res.status >= 300) throw new Error("HTTP " + res.status);
  return JSON.parse(res.body) as { item: DriveItem };
}

// ---- backup ----
export type BackupStatus = {
  enabled: boolean;
  frequency: string;
  provider: string;
  encryption: string;
  hasPassphrase: boolean;
  sections: { chats: boolean; search: boolean; watch: boolean };
  lastBackupAt: string | null;
  due: boolean;
  nextRunAt: string | null;
  connected: { zoho: boolean; google: boolean };
  runs: { id: string; provider: string; status: string; period: string; itemCount: number; sizeBytes: number; error: string | null; startedAt: string }[];
};

export function backupStatus() {
  return api<BackupStatus>("/api/backup/status");
}

export function runBackupNow() {
  return api<{ ok: boolean; runId: string }>("/api/backup/run", { method: "POST" });
}

export function googleConnectUrl() {
  return BASE_URL + "/api/google/connect";
}

export function backupFiles() {
  return api<{ provider: string; files: { id: string; name: string; url?: string }[] }>("/api/backup/files");
}

export function restoreBackup(input: { fileId: string; passphrase?: string; dryRun?: boolean }) {
  return api<{
    ok: boolean;
    dryRun: boolean;
    error?: string;
    encrypted?: boolean;
    period?: string;
    wouldImport?: { chats: number; chatMessages: number; search: number; watch: number };
    imported?: { chats: number; chatMessages: number; search: number; watch: number };
    skipped?: { chats: number; search: number };
  }>("/api/backup/restore", { method: "POST", body: JSON.stringify(input) });
}

// A readable name for a rendition height.
export function qualityLabel(value: string): string {
  if (value === "auto") return "Auto";
  if (value === "4320") return "8K";
  if (value === "2160") return "4K";
  return value + "p";
}
