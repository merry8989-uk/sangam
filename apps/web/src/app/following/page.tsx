import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import PreviewThumb from "@/components/PreviewThumb";

export const dynamic = "force-dynamic";

// Long-form videos from the channels you follow, newest first.
export default async function FollowingPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const following = await prisma.follow.findMany({
    where: { followerId: userId, status: "ACCEPTED" },
    select: { followeeId: true }
  });
  const ids = following.map((f) => f.followeeId);

  const videos = ids.length
    ? await prisma.post.findMany({
        where: { authorId: { in: ids }, type: "VIDEO", status: "READY", visibility: "PUBLIC" },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { author: true, media: true }
      })
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Following</h1>
      {ids.length === 0 && (
        <p className="text-ink-500">
          You are not following anyone yet. Find channels on <Link href="/explore" className="text-brand-700">Explore</Link>.
        </p>
      )}
      {ids.length > 0 && videos.length === 0 && (
        <p className="text-ink-500">No long-form videos from the channels you follow yet.</p>
      )}
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
              <div className="mt-2 text-sm font-medium group-hover:underline">{p.caption || "(no title)"}</div>
              <div className="text-xs text-ink-500">
                @{p.author.username} · {formatCount(p.viewCount)} views · {timeAgo(p.createdAt)}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
