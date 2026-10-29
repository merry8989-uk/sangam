import { prisma } from "./prisma";
import { keyBelongsToUser } from "./s3";

/**
 * May this viewer have these bytes?
 *
 * The media route used to redirect anyone who had a key straight to the object.
 * Every post response carries its media keys, so a private post's media could be
 * fetched by someone who was never meant to see it - and the keys are not secret,
 * they are in the payload.
 *
 * One rule, used by the redirect route and by the frame and poster routes, so
 * there is one place to be right rather than three.
 *
 *   a media row that belongs to a post   -> the post's visibility applies
 *   a media row that belongs to a story  -> the story's author, or a follower
 *   a media row with neither             -> only the account it was uploaded for
 *   no media row at all                  -> only the account in the key's prefix
 *
 * A denial is a 404 rather than a 403: confirming that something exists but is
 * not yours is itself a disclosure.
 */

export type MediaAccess = {
  allowed: boolean;
  /** Why, for the log. Never sent to the client. */
  reason: string;
  /** The key to serve, when allowed. */
  key: string;
};

/** Can `viewerId` (which may be null) see the post's media? */
async function canSeePost(viewerId: string | null, postId: string): Promise<{ ok: boolean; reason: string }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, visibility: true, status: true }
  });
  if (!post) return { ok: false, reason: "post is gone" };

  if (viewerId && viewerId === post.authorId) return { ok: true, reason: "author" };

  // A post still processing has media nobody should be pulling yet.
  if (post.status !== "READY") return { ok: false, reason: "post is not ready" };

  if (post.visibility === "PRIVATE") return { ok: false, reason: "private post" };

  if (post.visibility === "FOLLOWERS") {
    if (!viewerId) return { ok: false, reason: "followers-only, anonymous" };
    const follows = await prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: viewerId, followeeId: post.authorId } },
      select: { status: true }
    });
    if (follows?.status !== "ACCEPTED") return { ok: false, reason: "followers-only, not a follower" };
  }

  return { ok: true, reason: "public" };
}

async function canSeeStory(viewerId: string | null, storyId: string): Promise<{ ok: boolean; reason: string }> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { authorId: true, expiresAt: true }
  });
  if (!story) return { ok: false, reason: "story is gone" };
  if (story.expiresAt.getTime() < Date.now()) return { ok: false, reason: "story has expired" };
  if (viewerId && viewerId === story.authorId) return { ok: true, reason: "author" };
  if (!viewerId) return { ok: false, reason: "story, anonymous" };

  // Stories are shown to people who follow the author.
  const follows = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: story.authorId } },
    select: { status: true }
  });
  return follows?.status === "ACCEPTED"
    ? { ok: true, reason: "story, follower" }
    : { ok: false, reason: "story, not a follower" };
}

/**
 * Resolve one storage key against a viewer.
 *
 * The key prefix is checked even when a row exists: a media row's ownerId is who
 * it was created for, and the prefix is who the upload was issued to. They should
 * agree, and if they do not, the safer of the two wins.
 */
export async function canReadMediaKey(viewerId: string | null, key: string): Promise<MediaAccess> {
  if (!key || key.includes("..")) return { allowed: false, reason: "malformed key", key };

  const media = await prisma.media.findFirst({
    where: { storageKey: key },
    select: { id: true, ownerId: true, postId: true, storyId: true }
  });

  if (media?.postId) {
    const r = await canSeePost(viewerId, media.postId);
    return { allowed: r.ok, reason: `post: ${r.reason}`, key };
  }

  if (media?.storyId) {
    const r = await canSeeStory(viewerId, media.storyId);
    return { allowed: r.ok, reason: `story: ${r.reason}`, key };
  }

  // An anonymous chat attachment. The chat is the boundary: if the viewer is in
  // it and it has not expired, the file is theirs to read.
  const anon = await prisma.anonAttachment.findFirst({
    where: { storageKey: key },
    select: { message: { select: { chatId: true } } }
  });
  if (anon?.message?.chatId) {
    const chat = await prisma.anonChat.findUnique({
      where: { id: anon.message.chatId },
      select: {
        mode: true,
        status: true,
        expiresAt: true,
        participants: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false
      }
    });
    if (!chat) return { allowed: false, reason: "anon: chat is gone", key };
    if (chat.status !== "ACTIVE") return { allowed: false, reason: "anon: chat is not active", key };
    if (chat.mode === "TEMPORARY" && chat.expiresAt && chat.expiresAt.getTime() <= Date.now()) {
      return { allowed: false, reason: "anon: chat expired", key };
    }
    const isMember = Array.isArray(chat.participants) && chat.participants.length > 0;
    return isMember
      ? { allowed: true, reason: "anon: participant", key }
      : { allowed: false, reason: "anon: not a participant", key };
  }

  // No row, or a row not attached to anything yet: this is an upload that has
  // not been posted. Only the account it was issued to may read it - which is
  // exactly what the key prefix records.
  const owner = media?.ownerId ?? null;
  if (owner && viewerId === owner) return { allowed: true, reason: "unposted upload, owner", key };

  // The prefix is the fallback for a row that is missing entirely.
  if (viewerId && keyBelongsToUser(key, viewerId)) {
    return { allowed: true, reason: "unposted upload, key prefix", key };
  }

  return { allowed: false, reason: media ? "unposted upload, not the owner" : "no such media", key };
}
