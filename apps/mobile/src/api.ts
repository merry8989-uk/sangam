import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

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
