// Shared vocabulary for skip points.
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

// Community segments are hidden once the crowd turns on them.
export const SKIP_HIDE_BELOW = -2;

export type SkipSegmentDTO = {
  id: string;
  mediaId: string;
  startSec: number;
  endSec: number;
  category: string;
  visibility: string;
  upvotes: number;
  downvotes: number;
  authorId: string;
  authorName?: string;
};

export function score(s: { upvotes: number; downvotes: number }): number {
  return s.upvotes - s.downvotes;
}
