// Thin client for the Python AI/media service.
import { newTraceparent } from "./trace";
import type { Rendition } from "./quality";
import { recordAiCall } from "./metrics";
class AiError extends Error {}

export async function callAi<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", traceparent: newTraceparent() },
      body: JSON.stringify(body)
    });
    await recordAiCall(res.ok);
    if (!res.ok) throw new AiError(`AI service error ${res.status} on ${path}`);
    return (await res.json()) as T;
  } catch (err) {
    // Network-level failure: the status-based recording above never ran.
    if (!(err instanceof AiError)) await recordAiCall(false);
    throw err;
  }
}

export type ProcessedImage = { width: number; height: number; thumbnailKey: string };
export type ProcessedVideo = {
  width: number;
  height: number;
  durationMs: number;
  thumbnailKey: string;
  hlsKey: string;
  previewKey: string;
  renditions: number[];
  variants: Rendition[];
};
export type ModerationResult = {
  flagged: boolean;
  score: number;
  categories: string[];
  matches: string[];
};
export type RankCandidate = {
  post_id: string;
  author_id?: string;
  engagement?: number;
  recency_hours?: number;
  affinity?: number;
};

export function processImage(key: string): Promise<ProcessedImage> {
  return callAi<ProcessedImage>("/process/image", { key });
}

export function processVideo(
  key: string,
  opts: { maxHeight?: number | null; audioBitrate?: string | null } = {}
): Promise<ProcessedVideo> {
  return callAi<ProcessedVideo>("/process/video", {
    key,
    max_height: opts.maxHeight ?? null,
    audio_bitrate: opts.audioBitrate ?? null
  });
}

export function moderateText(text: string): Promise<ModerationResult> {
  return callAi<ModerationResult>("/moderate", { text });
}

export function rankFeed(
  sources: Record<string, RankCandidate[]>,
  opts: { seen_ids?: string[]; blocked_authors?: string[]; limit?: number; max_per_author?: number } = {}
): Promise<{ post_ids: string[] }> {
  return callAi<{ post_ids: string[] }>("/feed/rank", { sources, ...opts });
}

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };
export type ChatReply = {
  content: string;
  model?: string | null;
  reasoning?: string | null;
  usage?: unknown;
};

// Public chat via Sarvam AI (model sarvam-105b, the model behind Indus).
// Runs server-side so the Sarvam key never reaches the browser.
export function sarvamChat(
  messages: ChatTurn[],
  opts: { system?: string; model?: string; temperature?: number; maxTokens?: number } = {}
): Promise<ChatReply> {
  return callAi<ChatReply>("/chat", {
    messages,
    system: opts.system,
    model: opts.model,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048
  });
}
