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

export type Post = {
  id: string;
  caption: string | null;
  type: string;
  createdAt: string;
  viewCount: number;
  author: { username: string; displayName: string };
  media: { id: string; kind: string; thumbnailKey: string | null; hlsKey: string | null; storageKey: string }[];
};

export const mediaUrl = (key: string) => BASE_URL + "/api/media/" + encodeURIComponent(key);
