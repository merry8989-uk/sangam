import type { Post, User, Media } from "@prisma/client";

type PostWith = Post & { author: User; media: Media[] };

export default function PostCard({ post }: { post: PostWith }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2">
        <span className="font-medium">@{post.author.username}</span>
        <time className="text-xs text-ink-500">{new Date(post.createdAt).toLocaleString("en-IN")}</time>
      </header>
      {post.caption && <p className="mb-3">{post.caption}</p>}
      {post.media.map((m) =>
        m.kind === "VIDEO" ? (
          <video key={m.id} controls className="w-full rounded-lg" src={m.storageKey} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} alt="" className="w-full rounded-lg" src={m.storageKey} />
        )
      )}
      <footer className="mt-3 text-sm text-ink-500">
        {post.likeCount} likes · {post.commentCount} comments · {post.viewCount} views
      </footer>
    </article>
  );
}
