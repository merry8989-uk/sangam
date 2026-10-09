import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import Composer from "@/components/Composer";

export const dynamic = "force-dynamic";

// Starter feed: newest public posts. Replace with the ranked feed service
// (see docs/ARCHITECTURE.md) once the ML pipeline lands.
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
          <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-medium">@{p.author.username}</span>
              <span className="text-xs text-ink-500">{p.type}</span>
            </div>
            {p.caption && <p className="mb-3">{p.caption}</p>}
            {p.media.map((m) =>
              m.kind === "VIDEO" ? (
                <video key={m.id} controls className="w-full rounded-lg" src={mediaUrl(m.storageKey)} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id}
                  alt={p.caption ?? ""}
                  className="w-full rounded-lg"
                  src={mediaUrl(m.thumbnailKey ?? m.storageKey)}
                />
              )
            )}
            <div className="mt-3 text-sm text-ink-500">
              {p.likeCount} likes · {p.commentCount} comments
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
