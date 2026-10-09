// One place for the quality vocabulary, shared by the player and the pipeline.

export type Quality = "auto" | "1080" | "720" | "480" | "360";

export type Rendition = {
  height: number;
  width: number;
  bitrateK: number;
  playlistKey: string;
};

export const QUALITY_OPTIONS: Quality[] = ["auto", "1080", "720", "480", "360"];

// Playback cap: "auto" means let the player adapt, a number caps the ladder.
export function capHeight(q: string | undefined | null): number | null {
  if (!q || q === "auto") return null;
  const n = Number(q);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Upload cap: what the transcoder is allowed to store.
export function uploadCapHeight(q: string | undefined | null): number | null {
  switch (q) {
    case "original":
      return null;
    case "high":
      return 1080;
    case "medium":
      return 720;
    case "low":
      return 480;
    default:
      return null;
  }
}

export function uploadAudioBitrate(q: string | undefined | null): string {
  switch (q) {
    case "low":
      return "96k";
    case "medium":
      return "128k";
    case "high":
    case "original":
      return "160k";
    default:
      return "128k";
  }
}

// Audio quality is a playback preference. We cannot switch audio tracks on the
// client, so a lower audio setting caps the overall rendition instead.
export function audioCapHeight(q: string | undefined | null): number | null {
  switch (q) {
    case "low":
      return 480;
    case "medium":
      return 720;
    default:
      return null;
  }
}

// The highest rendition that fits the cap. `null` means "use the master
// playlist and let the player adapt".
export function pickRendition(
  variants: Rendition[] | undefined,
  cap: number | null
): Rendition | null {
  if (!variants || variants.length === 0 || cap === null) return null;
  const sorted = [...variants].sort((a, b) => b.height - a.height);
  return sorted.find((v) => v.height <= cap) ?? sorted[sorted.length - 1];
}

// The effective playback cap: the stricter of video and audio quality.
export function playbackCap(videoQuality?: string | null, audioQuality?: string | null): number | null {
  const a = capHeight(videoQuality);
  const b = audioCapHeight(audioQuality);
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}
