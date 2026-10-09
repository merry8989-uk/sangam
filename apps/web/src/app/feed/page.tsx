import { prisma } from "@/lib/prisma";
import Composer from "@/components/Composer";
import PostCard from "@/components/PostCard";

export const dynamic = "force-dynamic";

// Starter feed: newest public posts. Replace with the ranked feed service
// (see docs/BLUEPRINT.md) once the ML pipeline lands.
export default async function FeedPage() {
  const posts = await prisma.post.findMany({
    where: { visibility: "PUBLIC", status: "READY" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { author: true, media: true }
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Feed</h1>
      <Composer />
      <ul className="mt-6 space-y-4">
        {posts.length === 0 && <li className="text-ink-500">No posts yet. Be the first.</li>}
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>
    </main>
  );
}
