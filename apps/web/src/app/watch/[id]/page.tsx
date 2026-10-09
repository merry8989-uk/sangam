import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import { bumpView, pendingViews } from "@/lib/counters";
import VideoPlayer from "@/components/VideoPlayer";
import Comments from "@/components/Comments";
import FollowButton from "@/components/FollowButton";
import LikeButton from "@/components/LikeButton";
import PreviewThumb from "@/components/PreviewThumb";
import DeletePostButton from "@/components/DeletePostButton";
import { getSettingsOptional } from "@/lib/settings";
import { playbackCap, type Rendition } from "@/lib/quality";
import ReportButton from "@/components/ReportButton";
import ThumbnailPicker from "@/components/ThumbnailPicker";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: { author: true, media: true, hashtags: { include: { hashtag: true } } }
  });
  if (!post || post.status !== "READY") notFound();

  const video = post.media.find((m) => m.kind === "VIDEO" && m.hlsKey);

  // Skip points: everyone's public ones plus the viewer's own private ones.
  const skipRows = video
    ? await prisma.skipSegment.findMany({
        where: {
          mediaId: video.id,
          OR: [{ visibility: "EVERYONE" }, ...(viewerId ? [{ authorId: viewerId }] : [])]
        },
        orderBy: { startSec: "asc" },
        select: { startSec: true, endSec: true, upvotes: true, downvotes: true, visibility: true, authorId: true }
      })
    : [];
  const skipSegments = skipRows
    .filter((r) => r.authorId === viewerId || (r.visibility === "EVERYONE" && r.upvotes - r.downvotes >= -2))
    .map((r) => ({ startSec: r.startSec, endSec: r.endSec }));

  const settings = await getSettingsOptional(viewerId);

  // Record this view in the viewer's history (unless they turned history off).
  if (viewerId && settings?.historyEnabled !== false) {
    await prisma.viewHistory
      .upsert({
        where: { userId_postId: { userId: viewerId, postId: post.id } },
        update: { viewedAt: new Date() },
        create: { userId: viewerId, postId: post.id }
      })
      .catch(() => {});
  }

  // View counting is buffered in Redis and flushed to the database in batches.
  await bumpView(post.id);
  const viewTotal = post.viewCount + (await pendingViews(post.id));

  const liked = viewerId
    ? Boolean(await prisma.like.findUnique({ where: { postId_userId: { postId: post.id, userId: viewerId } } }))
    : false;

  const isFollowing =
    viewerId && viewerId !== post.authorId
      ? Boolean(
          await prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: post.authorId } }
          })
        )
      : false;

  const tagIds = post.hashtags.map((h) => h.hashtagId);
  const related = await prisma.post.findMany({
    where: {
      id: { not: post.id },
      status: "READY",
      visibility: "PUBLIC",
      OR: [{ authorId: post.authorId }, ...(tagIds.length ? [{ hashtags: { some: { hashtagId: { in: tagIds } } } }] : [])]
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { author: true, media: true }
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {video ? (
            <VideoPlayer
              src={mediaUrl(video.hlsKey as string)}
              poster={video.thumbnailKey ? mediaUrl(video.thumbnailKey) : undefined}
              className="w-full rounded-xl bg-black"
              segments={skipSegments}
              skipEnabled={settings?.sponsorSkip ?? false}
              variants={(video.renditions ?? []) as unknown as Rendition[]}
              cap={playbackCap(settings?.videoQuality, settings?.audioQuality)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="w-full rounded-xl"
              src={mediaUrl(post.media[0]?.thumbnailKey ?? post.media[0]?.storageKey ?? "")}
            />
          )}

          {viewerId === post.authorId && video ? (
            <ThumbnailPicker mediaId={video.id} initialThumbnailKey={video.thumbnailKey} />
          ) : null}

          <h1 className="mt-3 text-xl font-semibold">{post.caption || "(no title)"}</h1>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href={`/channel/${post.author.username}`} className="flex items-center gap-2">
              <span className="h-9 w-9 rounded-full bg-brand-100" />
              <span>
                <span className="block text-sm font-medium">{post.author.displayName}</span>
                <span className="block text-xs text-ink-500">@{post.author.username}</span>
              </span>
            </Link>
            {viewerId && viewerId !== post.authorId && (
              <FollowButton targetId={post.authorId} initialFollowing={isFollowing} />
            )}
            <div className="ml-auto flex items-center gap-2">
              <LikeButton postId={post.id} initialCount={post.likeCount} initialLiked={liked} />
            </div>
          </div>

          <div className="mt-2 text-sm text-ink-500">
            {formatCount(viewTotal)} views · {timeAgo(post.createdAt)}
            {video?.durationMs ? ` · ${formatDuration(video.durationMs)}` : ""}
          </div>

          <div className="mt-3 flex gap-2">
            {viewerId === post.authorId && <DeletePostButton postId={post.id} />}
            <ReportButton entityType="post" entityId={post.id} />
          </div>

          {post.hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {post.hashtags.map((h) => (
                <Link key={h.hashtagId} href={`/tag/${encodeURIComponent(h.hashtag.tag)}`}
                      className="text-sm font-medium text-brand-700">
                  #{h.hashtag.tag}
                </Link>
              ))}
            </div>
          )}

          <Comments postId={post.id} threaded={settings?.threadedComments ?? true} sort={settings?.commentSort ?? "top"} />
        </div>

        <aside>
          <h2 className="mb-2 text-sm font-semibold text-ink-500">Related</h2>
          <ul className="space-y-3">
            {related.map((r) => {
              const m = r.media[0];
              return (
                <li key={r.id}>
                  <Link href={`/watch/${r.id}`} className="flex gap-2">
                    <PreviewThumb
                      poster={m?.thumbnailKey ? mediaUrl(m.thumbnailKey) : undefined}
                      preview={m?.previewKey ? mediaUrl(m.previewKey) : undefined}
                      className="h-16 w-28 shrink-0 rounded bg-slate-200"
                    />
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-sm font-medium">{r.caption || "(no title)"}</div>
                      <div className="text-xs text-ink-500">@{r.author.username}</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </main>
  );
}
