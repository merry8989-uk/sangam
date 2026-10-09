import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rankFeed, type RankCandidate } from "@/lib/ai";
import PostCard from "@/components/PostCard";

export const dynamic = "force-dynamic";

// Ranked feed. Builds candidates from the follow graph and a trending pool,
// then asks the AI service to retrieve -> rank -> diversify them. Falls back
// to chronological order if the ranking service is unavailable.
export default async function ForYouPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const include = { author: true, media: true } as const;
  const followedIds = userId
    ? (
        await prisma.follow.findMany({
          where: { followerId: userId, status: "ACCEPTED" },
          select: { followeeId: true }
        })
      ).map((f) => f.followeeId)
    : [];

  const following = followedIds.length
    ? await prisma.post.findMany({
        where: { authorId: { in: followedIds }, visibility: "PUBLIC", status: "READY" },
        orderBy: { createdAt: "desc" },
        take: 100,
        include
      })
    : [];

  const trending = await prisma.post.findMany({
    where: { visibility: "PUBLIC", status: "READY" },
    orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
    take: 100,
    include
  });

  const now = Date.now();
  const toCandidate = (p: (typeof trending)[number], affinity: number): RankCandidate => ({
    post_id: p.id,
    author_id: p.authorId,
    engagement: p.likeCount + p.commentCount,
    recency_hours: (now - new Date(p.createdAt).getTime()) / 3_600_000,
    affinity
  });

  const maxEng = Math.max(1, ...[...following, ...trending].map((p) => p.likeCount + p.commentCount));
  const sources = {
    following: following.map((p) => ({ ...toCandidate(p, 1.0), engagement: (p.likeCount + p.commentCount) / maxEng })),
    trending: trending.map((p) => ({ ...toCandidate(p, 0.1), engagement: (p.likeCount + p.commentCount) / maxEng }))
  };

  let ordered = trending;
  try {
    const { post_ids } = await rankFeed(sources, { limit: 30, max_per_author: 3 });
    const byId = new Map([...following, ...trending].map((p) => [p.id, p]));
    ordered = post_ids.map((id) => byId.get(id)).filter(Boolean) as typeof trending;
  } catch {
    // ranking service down - fall back to the trending order already loaded
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">For you</h1>
      <ul className="space-y-4">
        {ordered.length === 0 && <li className="text-ink-500">Nothing to show yet.</li>}
        {ordered.map((p) => (
          <li key={p.id}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
    </main>
  );
}
