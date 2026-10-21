import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Dimensions, Platform } from "react-native";
import type { DiagEntry, DiagDeviceInfo, DiagSeverity } from "./diagnostics";

/**
 * The device half of a diagnostics report on Android.
 *
 * Like the web version: records locally, keeps a bounded buffer, and survives a
 * restart by mirroring into storage. Nothing is sent anywhere until the user
 * presses Send.
 */

const STORAGE_KEY = "sangam.diagnostics.v1";
const MAX_ENTRIES = 200;
const MAX_MESSAGE = 500;

let buffer: DiagEntry[] = [];
let loaded = false;
let installed = false;

function clip(s: unknown, max = MAX_MESSAGE): string {
  const t = typeof s === "string" ? s : safeString(s);
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function safeString(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserialisable]";
  }
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) buffer = parsed.slice(-MAX_ENTRIES);
    }
  } catch {
    buffer = [];
  }
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_ENTRIES)));
  } catch {
    /* storage full or blocked - recording still works for this session */
  }
}

export async function record(
  severity: DiagSeverity,
  kind: string,
  message: unknown,
  detail?: Record<string, unknown>
): Promise<void> {
  await load();
  buffer.push({ at: new Date().toISOString(), kind, severity, message: clip(message), detail });
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  await persist();
}

export async function getEntries(): Promise<DiagEntry[]> {
  await load();
  return buffer.slice();
}

export async function clearEntries(): Promise<void> {
  buffer = [];
  await persist();
}

/**
 * Catch what escapes, once. React Native raises errors through the global
 * handler rather than the browser events, so the two differ from the web.
 */
export function installCapture(): void {
  if (installed) return;
  installed = true;

  const globals = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };

  const utils = globals.ErrorUtils;
  if (utils?.getGlobalHandler && utils?.setGlobalHandler) {
    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      void record("error", "unhandled", safeString(error), { fatal: Boolean(isFatal) });
      previous?.(error, isFatal);
    });
  }
}

/** Everything the report needs about this device. */
export function deviceInfo(appVersion: string, route: string): DiagDeviceInfo {
  const { width, height } = Dimensions.get("screen");
  const cfg = Constants.expoConfig;
  return {
    platform: "android",
    appVersion,
    route,
    osName: Platform.OS,
    osVersion: String(Platform.Version ?? ""),
    deviceName: cfg?.name ?? "unknown",
    appOwnership: Constants.appOwnership ?? "standalone",
    expoVersion: Constants.expoVersion ?? "",
    screen: `${Math.round(width)}x${Math.round(height)}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    online: true,
    startedAt: new Date().toISOString()
  };
}
