// Thin client for the Python AI/media service.
export async function callAi<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`AI service error ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export type ProcessedImage = { width: number; height: number; thumbnailKey: string };
export type ProcessedVideo = {
  width: number;
  height: number;
  durationMs: number;
  thumbnailKey: string;
  hlsKey: string;
  renditions: number[];
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

export function processVideo(key: string): Promise<ProcessedVideo> {
  return callAi<ProcessedVideo>("/process/video", { key });
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
