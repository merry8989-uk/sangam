import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export default async function TagPage({ params }: { params: { tag: string } }) {
  const tag = decodeURIComponent(params.tag).toLowerCase();

  const posts = await prisma.post.findMany({
    where: {
      visibility: "PUBLIC",
      status: "READY",
      hashtags: { some: { hashtag: { tag } } }
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { author: true, media: true }
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">#{tag}</h1>
      <p className="mb-6 text-sm text-ink-500">{posts.length} posts</p>
      <div className="grid grid-cols-3 gap-2">
        {posts.map((p) => {
          const m = p.media[0];
          return (
            <div key={p.id} className="aspect-square overflow-hidden rounded-lg bg-slate-200">
              {m && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={p.caption ?? ""} className="h-full w-full object-cover"
                     src={mediaUrl(m.thumbnailKey ?? m.storageKey)} />
              )}
            </div>
          );
        })}
      </div>
      {posts.length === 0 && <p className="text-ink-500">No posts with this tag yet.</p>}
    </main>
  );
}
