import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import FollowButton from "@/components/FollowButton";
import Avatar from "@/components/Avatar";
import MessageButton from "@/components/MessageButton";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as { id?: string } | undefined)?.id;

  const user = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      posts: {
        where: { status: "READY" },
        orderBy: { createdAt: "desc" },
        take: 24,
        include: { media: true }
      },
      _count: { select: { followers: true, following: true, posts: true } }
    }
  });
  if (!user) notFound();

  const isFollowing =
    viewerId && viewerId !== user.id
      ? Boolean(
          await prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: user.id } }
          })
        )
      : false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {user.coverUrl && (
        <div className="mb-4 h-32 overflow-hidden rounded-xl bg-gradient-to-r from-brand-100 to-brand-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user.coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <header className="flex items-center gap-4">
        <Avatar src={user.avatarUrl} name={user.displayName} size={80} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{user.displayName}</h1>
          <p className="text-ink-500">@{user.username}</p>
          <p className="mt-1 text-sm text-ink-700">
            {user._count.posts} posts · {user._count.followers} followers · {user._count.following} following
          </p>
        </div>
        {viewerId && viewerId !== user.id && (
          <div className="flex gap-2">
            <MessageButton userId={user.id} />
            <FollowButton targetId={user.id} initialFollowing={isFollowing} />
          </div>
        )}
      </header>
      {user.bio && <p className="mt-4">{user.bio}</p>}
      <div className="mt-6 grid grid-cols-3 gap-2">
        {user.posts.map((p) => {
          const first = p.media[0];
          return (
            <div key={p.id} className="aspect-square overflow-hidden rounded-lg bg-slate-200">
              {first && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={p.caption ?? ""}
                  className="h-full w-full object-cover"
                  src={mediaUrl(first.thumbnailKey ?? first.storageKey)}
                />
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
