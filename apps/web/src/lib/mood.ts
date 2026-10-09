import { prisma } from "./prisma";
import { detectMood } from "./themes";

// Derive the user's mood from the content they engage with - the posts they
// like, save and view. This is what lets a feed full of melancholy content pull
// a dark theme, or devotional content pull a devotion theme.
export async function detectUserMood(
  userId: string
): Promise<{ mood: string | null; scores: Record<string, number> }> {
  const [likes, saves, views] = await Promise.all([
    prisma.like.findMany({ where: { userId }, take: 100, select: { postId: true } }),
    prisma.bookmark.findMany({ where: { userId }, take: 100, select: { postId: true } }),
    prisma.viewHistory.findMany({ where: { userId }, take: 100, select: { postId: true } })
  ]);

  const ids = [...new Set([...likes, ...saves, ...views].map((x) => x.postId))].slice(0, 200);
  if (!ids.length) return { mood: null, scores: {} };

  const posts = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: { caption: true, hashtags: { include: { hashtag: true } } }
  });

  const scores: Record<string, number> = {};
  for (const p of posts) {
    const text = [p.caption ?? "", ...p.hashtags.map((h) => h.hashtag.tag)].join(" ");
    const mood = detectMood(text);
    if (mood) scores[mood] = (scores[mood] ?? 0) + 1;
  }

  const mood = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { mood, scores };
}
