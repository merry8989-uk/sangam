import { callAi } from "./ai";

export type EmbedResult = { embeddings: number[][]; dim: number; engine: string };

// Embed texts via the AI service. Vectors come back L2-normalised, so cosine
// similarity is a plain dot product.
export function embedTexts(texts: string[]): Promise<EmbedResult> {
  return callAi<EmbedResult>("/embed", { texts });
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
