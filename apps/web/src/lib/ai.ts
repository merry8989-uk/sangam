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

export function processImage(key: string): Promise<ProcessedImage> {
  return callAi<ProcessedImage>("/process/image", { key });
}
