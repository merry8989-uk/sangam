import Link from "next/link";
import type { Post, User, Media } from "@prisma/client";
import { mediaUrl } from "@/lib/s3";
import VideoPlayer from "./VideoPlayer";
import LikeButton from "./LikeButton";

type PostWith = Post & { author: User; media: Media[] };

export default function PostCard({
  post,
  liked = false,
  interactive = true
}: {
  post: PostWith;
  liked?: boolean;
  interactive?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2">
        <Link href={`/profile/${post.author.username}`} className="font-medium hover:underline">
          @{post.author.username}
        </Link>
        <time className="text-xs text-ink-500">
          {new Date(post.createdAt).toLocaleString("en-IN")}
        </time>
      </header>
      {post.caption && <p className="mb-3">{post.caption}</p>}
      {post.media.map((m) =>
        m.kind === "VIDEO" && m.hlsKey ? (
          <VideoPlayer
            key={m.id}
            src={mediaUrl(m.hlsKey)}
            poster={m.thumbnailKey ? mediaUrl(m.thumbnailKey) : undefined}
            className="w-full rounded-lg bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={m.id}
            alt={post.caption ?? ""}
            className="w-full rounded-lg"
            src={mediaUrl(m.thumbnailKey ?? m.storageKey)}
          />
        )
      )}
      <footer className="mt-3 flex items-center gap-2 text-sm text-ink-500">
        {interactive ? (
          <LikeButton postId={post.id} initialCount={post.likeCount} initialLiked={liked} />
        ) : (
          <span>Liked · {post.likeCount}</span>
        )}
        <Link href={`/post/${post.id}`} className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200">
          Comments · {post.commentCount}
        </Link>
        <span className="ml-auto">{post.viewCount} views</span>
      </footer>
    </article>
  );
}
