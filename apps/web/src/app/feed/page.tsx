import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Composer from "@/components/Composer";
import PostCard from "@/components/PostCard";
import StoriesBar from "@/components/StoriesBar";

export const dynamic = "force-dynamic";

// Starter feed: newest public posts. Replace with the ranked feed service
// (see docs/BLUEPRINT.md) once the ML pipeline lands.
export default async function FeedPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const posts = await prisma.post.findMany({
    where: { visibility: "PUBLIC", status: "READY" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { author: true, media: true }
  });

  const ids = posts.map((p) => p.id);
  const liked = userId && ids.length
    ? await prisma.like.findMany({ where: { userId, postId: { in: ids } }, select: { postId: true } })
    : [];
  const likedSet = new Set(liked.map((l) => l.postId));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Feed</h1>
      {userId && <StoriesBar />}
      <Composer />
      <ul className="mt-6 space-y-4">
        {posts.length === 0 && <li className="text-ink-500">No posts yet. Be the first.</li>}
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} liked={likedSet.has(p.id)} />
          </li>
        ))}
      </ul>
    </main>
  );
}
