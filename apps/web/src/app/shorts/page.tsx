import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import VideoPlayer from "@/components/VideoPlayer";

export const dynamic = "force-dynamic";

// Vertical short-video surface: full-height players stacked in a scroll feed.
export default async function ShortsPage() {
  const posts = await prisma.post.findMany({
    where: {
      visibility: "PUBLIC",
      status: "READY",
      OR: [{ type: "SHORT" }, { type: "VIDEO" }],
      media: { some: { kind: "VIDEO" } }
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { author: true, media: true }
  });

  return (
    <main className="mx-auto max-w-md px-2 py-4">
      <h1 className="mb-4 px-2 text-xl font-semibold">Shorts</h1>
      <div className="space-y-4">
        {posts.length === 0 && <p className="px-2 text-ink-500">No short videos yet.</p>}
        {posts.map((p) => {
          const vid = p.media.find((m) => m.kind === "VIDEO" && m.hlsKey);
          if (!vid) return null;
          return (
            <section key={p.id} className="overflow-hidden rounded-2xl bg-black">
              <VideoPlayer
                src={mediaUrl(vid.hlsKey as string)}
                poster={vid.thumbnailKey ? mediaUrl(vid.thumbnailKey) : undefined}
                className="aspect-[9/16] w-full bg-black"
              />
              <div className="bg-white px-3 py-2">
                <span className="font-medium">@{p.author.username}</span>
                {p.caption && <p className="mt-1 text-sm text-ink-700">{p.caption}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
