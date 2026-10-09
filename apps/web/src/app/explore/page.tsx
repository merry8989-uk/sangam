import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hiddenUserIds } from "@/lib/filters";
import { mediaUrl } from "@/lib/s3";
import PreviewThumb from "@/components/PreviewThumb";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Explore: trending posts, popular hashtags and people to follow.
export default async function ExplorePage() {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const hidden = viewerId ? await hiddenUserIds(viewerId) : [];

  const [posts, tags, users] = await Promise.all([
    prisma.post.findMany({
      where: {
        visibility: "PUBLIC",
        status: "READY",
        ...(hidden.length ? { authorId: { notIn: hidden } } : {})
      },
      orderBy: [{ likeCount: "desc" }, { commentCount: "desc" }, { createdAt: "desc" }],
      take: 24,
      include: { author: true, media: true }
    }),
    prisma.hashtag.findMany({
      orderBy: { posts: { _count: "desc" } },
      take: 12,
      select: { tag: true, _count: { select: { posts: true } } }
    }),
    prisma.user.findMany({
      where: hidden.length ? { id: { notIn: hidden } } : {},
      orderBy: { followers: { _count: "desc" } },
      take: 8,
      select: { id: true, username: true, displayName: true, _count: { select: { posts: true } } }
    })
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Explore</h1>

      {tags.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-500">Trending tags</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <Link
                key={t.tag}
                href={`/tag/${encodeURIComponent(t.tag)}`}
                className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700"
              >
                #{t.tag} · {t._count.posts}
              </Link>
            ))}
          </div>
        </section>
      )}

      {users.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-500">People</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/profile/${u.username}`}
                className="w-24 shrink-0 rounded-xl border border-slate-200 bg-white p-3 text-center"
              >
                <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-brand-100" />
                <div className="truncate text-xs font-medium">@{u.username}</div>
                <div className="text-[11px] text-ink-500">{u._count.posts} posts</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-500">Trending posts</h2>
        <div className="grid grid-cols-3 gap-2">
          {posts.map((p) => {
            const m = p.media[0];
            return (
              <Link key={p.id} href={`/post/${p.id}`} className="block">
                <PreviewThumb
                  poster={m ? mediaUrl(m.thumbnailKey ?? m.storageKey) : undefined}
                  preview={m?.kind === "VIDEO" && m.previewKey ? mediaUrl(m.previewKey) : undefined}
                  className="aspect-square rounded-lg bg-slate-200"
                />
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
