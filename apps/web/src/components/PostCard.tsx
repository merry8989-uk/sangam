import Link from "next/link";
import type { Post, User, Media } from "@prisma/client";
import { mediaUrl } from "@/lib/s3";
import { DEFAULT_DISPLAY, type PostDisplay } from "@/lib/postDisplay";
import type { PrimaryState } from "@/lib/connect";
import VideoPlayer from "./VideoPlayer";
import LikeButton from "./LikeButton";
import Avatar from "./Avatar";
import BookmarkButton from "./BookmarkButton";
import ShareButton from "./ShareButton";
import PostDisplayMenu from "./PostDisplayMenu";
import PrimaryActionButton from "./PrimaryActionButton";

type PostWith = Post & { author: User; media: Media[] };

function duration(ms: number | null): string {
  if (!ms || ms <= 0) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One post.
 *
 * Every part the three-dot menu can switch off is guarded by a check on
 * `display` here, so the menu and the post never disagree: if a toggle is off,
 * the element is simply not rendered. The menu itself is always drawn - it is
 * the way back to the settings.
 */
export default function PostCard({
  post,
  liked = false,
  interactive = true,
  display = DEFAULT_DISPLAY,
  primaryState = "NONE",
  isOwn = false
}: {
  post: PostWith;
  liked?: boolean;
  interactive?: boolean;
  display?: PostDisplay;
  /** Where the viewer stands with this author, for the primary button. */
  primaryState?: PrimaryState;
  isOwn?: boolean;
}) {
  const pad = display.compact ? "p-3" : "p-4";
  const gap = display.compact ? "mb-1.5" : "mb-2";

  return (
    <article className={`rounded-xl border border-slate-200 bg-white ${pad}`}>
      <header className={`${gap} flex items-center gap-2`}>
        {display.authorAvatar && (
          <Link href={`/profile/${post.author.username}`}>
            <Avatar src={post.author.avatarUrl} name={post.author.displayName} size={36} />
          </Link>
        )}
        {display.authorHandle && (
          <Link href={`/profile/${post.author.username}`} className="font-medium hover:underline">
            @{post.author.username}
          </Link>
        )}
        {display.timestamp && (
          <time className="text-xs text-ink-500">{new Date(post.createdAt).toLocaleString("en-IN")}</time>
        )}
        {/* Always present: this is the only way back to the display settings. */}
        <PostDisplayMenu initial={display} />
      </header>

      {display.caption && post.caption && <p className="mb-3">{post.caption}</p>}

      {post.media.map((m) =>
        m.kind === "VIDEO" && m.hlsKey ? (
          <div key={m.id} className="relative">
            <VideoPlayer
              src={mediaUrl(m.hlsKey)}
              poster={m.thumbnailKey ? mediaUrl(m.thumbnailKey) : undefined}
              className="w-full rounded-lg bg-black"
            />
            {display.mediaBadges && m.durationMs ? (
              <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                {duration(m.durationMs)}
              </span>
            ) : null}
          </div>
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

      <footer className={`mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-500 ${display.compact ? "mt-2" : ""}`}>
        {display.likeButton &&
          (interactive ? (
            <LikeButton
              postId={post.id}
              initialCount={post.likeCount}
              initialLiked={liked}
              showCount={display.likeCount}
              showLabel={display.actionLabels}
            />
          ) : (
            <span>{display.likeCount ? `Liked · ${post.likeCount}` : "Liked"}</span>
          ))}

        {display.commentButton && (
          <Link
            href={`/post/${post.id}`}
            className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200"
          >
            {display.actionLabels ? "Comments" : "💬"}
            {display.commentCount ? ` · ${post.commentCount}` : ""}
          </Link>
        )}

        {display.shareButton && (
          <ShareButton
            postId={post.id}
            initialCount={post.shareCount}
            showCount={display.shareCount}
            showLabel={display.actionLabels}
          />
        )}

        {display.saveButton && interactive && (
          <BookmarkButton
            postId={post.id}
            initialCount={post.saveCount}
            showCount={display.saveCount}
            showLabel={display.actionLabels}
          />
        )}

        {display.viewCount && <span className="ml-auto">{post.viewCount} views</span>}

        {display.primaryActionButton && !isOwn && (
          <PrimaryActionButton
            targetId={post.author.id}
            action={display.primaryAction}
            initialState={primaryState}
          />
        )}
      </footer>
    </article>
  );
}
