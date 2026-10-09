import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import FollowButton from "@/components/FollowButton";
import PreviewThumb from "@/components/PreviewThumb";

export const dynamic = "force-dynamic";

// A channel is the video-centric view of a profile: long-form videos, shorts
// and an about section.
export default async function ChannelPage({ params }: { params: { username: string } }) {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;

  const user = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      posts: {
        where: { status: "READY", visibility: "PUBLIC" },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: { media: true }
      },
      _count: { select: { followers: true, following: true, posts: true } }
    }
  });
  if (!user) notFound();

  const videos = user.posts.filter((p) => p.type === "VIDEO");
  const shorts = user.posts.filter((p) => p.type === "SHORT");

  const isFollowing =
    viewerId && viewerId !== user.id
      ? Boolean(
          await prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: user.id } }
          })
        )
      : false;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="h-32 rounded-xl bg-gradient-to-r from-brand-100 to-brand-50" />
      <header className="-mt-8 flex flex-wrap items-center gap-4 px-2">
        <div className="h-20 w-20 rounded-full border-4 border-white bg-brand-100" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{user.displayName}</h1>
          <p className="text-ink-500">
            @{user.username} · {formatCount(user._count.followers)} followers · {videos.length} videos
          </p>
        </div>
        {viewerId && viewerId !== user.id && (
          <FollowButton targetId={user.id} initialFollowing={isFollowing} />
        )}
      </header>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Videos</h2>
        {videos.length === 0 && <p className="text-ink-500">No long-form videos yet.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((p) => {
            const m = p.media.find((x) => x.kind === "VIDEO");
            return (
              <Link key={p.id} href={`/watch/${p.id}`} className="group">
                <div className="relative">
                  <PreviewThumb
                    poster={m?.thumbnailKey ? mediaUrl(m.thumbnailKey) : undefined}
                    preview={m?.previewKey ? mediaUrl(m.previewKey) : undefined}
                    className="aspect-video rounded-lg bg-slate-200"
                  />
                  {m?.durationMs ? (
                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] text-white">
                      {formatDuration(m.durationMs)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-medium group-hover:underline">
                  {p.caption || "(no title)"}
                </div>
                <div className="text-xs text-ink-500">
                  {formatCount(p.viewCount)} views · {timeAgo(p.createdAt)}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {shorts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold">Shorts</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {shorts.map((p) => {
              const m = p.media.find((x) => x.kind === "VIDEO");
              return (
                <Link key={p.id} href={`/watch/${p.id}`} className="w-28 shrink-0">
                  <div className="aspect-[9/16] overflow-hidden rounded-lg bg-slate-200">
                    {m?.thumbnailKey && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="h-full w-full object-cover" src={mediaUrl(m.thumbnailKey)} />
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs">{p.caption}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">About</h2>
        <p className="text-sm text-ink-700">{user.bio || "No description yet."}</p>
      </section>
    </main>
  );
}
