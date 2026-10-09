// Extract #tags from a caption. Supports Latin and Devanagari word
// characters so Indian-language tags work.
const TAG_RE = /#([\w\u0900-\u097F]{1,50})/g;

export function extractTags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const out = new Set<string>();
  for (const m of caption.matchAll(TAG_RE)) {
    out.add(m[1].toLowerCase());
  }
  return [...out].slice(0, 20);
}
