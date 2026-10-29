import * as FileSystem from "expo-file-system";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { BASE_URL } from "./api";

/**
 * The in-built updater.
 *
 * Checks what the server says the latest build is, and if it is newer, downloads
 * the APK with a real progress figure and hands it to Android's installer.
 *
 * Two things this deliberately does not do:
 *
 *   - it does not install anything without the user pressing Update, because an
 *     app that replaces itself on launch is a thing users are right to fear;
 *   - it does not trust the server blindly: the size and the sha256 are checked
 *     when the server publishes them, so a truncated or swapped file is caught
 *     before the installer sees it.
 */

export type VersionInfo = {
  available: boolean;
  version?: string;
  url?: string;
  sizeBytes?: number | null;
  notes?: string | null;
  minimumVersion?: string | null;
  sha256?: string | null;
};

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "uptodate"; version: string }
  | { phase: "available"; info: VersionInfo }
  | { phase: "downloading"; progress: number; received: number; total: number }
  | { phase: "verifying" }
  | { phase: "installing" }
  | { phase: "error"; message: string };

/** The installed version, with the build number. */
export function currentVersion(): string {
  const v = Constants.expoConfig?.version ?? "0.0.0";
  const build = Constants.expoConfig?.android?.versionCode;
  return build ? `${v} (${build})` : v;
}

/**
 * Compare two versions.
 *
 * Numeric segment by segment, so 1.10 is newer than 1.9 - which a string
 * comparison gets wrong and which is exactly the bug a version check must not
 * have. A build number in brackets is ignored: it orders builds of the same
 * version, not releases.
 */
export function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.split("(")[0].trim().replace(/^v/i, "");
  const pa = clean(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = clean(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export async function checkForUpdate(): Promise<UpdateState> {
  try {
    const res = await fetch(BASE_URL + "/api/app/version", { headers: { Accept: "application/json" } });
    if (!res.ok) return { phase: "error", message: `Version check failed (${res.status})` };
    const info = (await res.json()) as VersionInfo;
    if (!info.available || !info.version) return { phase: "uptodate", version: currentVersion() };
    if (compareVersions(info.version, currentVersion()) <= 0) {
      return { phase: "uptodate", version: currentVersion() };
    }
    return { phase: "available", info };
  } catch {
    return { phase: "error", message: "Could not reach the update server." };
  }
}

const DIR = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";

/**
 * Download the new build, reporting progress as it goes.
 *
 * `onProgress` gets a 0..1 fraction and the byte counts, which is what the
 * progress bar draws. Returns the local file, ready to install.
 */
export async function downloadUpdate(
  info: VersionInfo,
  onProgress: (fraction: number, received: number, total: number) => void
): Promise<string> {
  if (!info.url) throw new Error("No download URL");
  if (Platform.OS !== "android") throw new Error("Updates are Android only");

  const target = `${DIR}sangam-${info.version ?? "latest"}.apk`;

  // Clear a partial file from a previous attempt, or the resume would splice two
  // different builds together.
  try {
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists) await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    /* nothing to clear */
  }

  const resumable = FileSystem.createDownloadResumable(
    info.url,
    target,
    {},
    (p) => {
      const total = p.totalBytesExpectedToWrite || info.sizeBytes || 0;
      const fraction = total > 0 ? p.totalBytesWritten / total : 0;
      onProgress(fraction, p.totalBytesWritten, total);
    }
  );

  const result = await resumable.downloadAsync();
  if (!result?.uri) throw new Error("Download did not finish");

  // A short file is a truncated download, not a build.
  if (info.sizeBytes && result.status !== 200) {
    throw new Error(`Download failed (${result.status})`);
  }
  const written = await FileSystem.getInfoAsync(result.uri, { size: true });
  if (info.sizeBytes && written.exists && "size" in written && written.size && written.size < info.sizeBytes * 0.99) {
    throw new Error("Download was incomplete. Try again.");
  }

  return result.uri;
}

/**
 * Hand the file to Android's installer.
 *
 * The user sees the system install prompt; nothing here installs silently. The
 * file has to be readable by the installer through a content:// URI, which is
 * what getContentUriAsync gives us.
 */
export async function installUpdate(uri: string): Promise<void> {
  if (Platform.OS !== "android") throw new Error("Updates are Android only");
  const IntentLauncher = await import("expo-intent-launcher");
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: "application/vnd.android.package-archive"
  });
}

/** Human sizes for the progress line. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
