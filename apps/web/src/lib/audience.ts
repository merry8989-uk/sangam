import { prisma } from "./prisma";

/**
 * Who is allowed to do a thing to someone's post.
 *
 * `whoCanComment`, `whoCanShare` and `whoCanReshare` were stored, shown in the
 * settings screen, and read by nothing. A user could set "nobody may comment",
 * see it saved, and still get comments. That is worse than not offering the
 * setting: it reads as a broken product rather than an absent feature.
 *
 * One rule, used by every route that needs it, so there is one place to be right.
 */

export const AUDIENCES = ["EVERYONE", "FOLLOWERS", "NOBODY"] as const;
export type Audience = (typeof AUDIENCES)[number];

export function isAudience(v: unknown): v is Audience {
  return typeof v === "string" && (AUDIENCES as readonly string[]).includes(v);
}

export function audienceFrom(value: string | null | undefined): Audience {
  return isAudience(value) ? value : "EVERYONE";
}

export type AudienceCheck = {
  allowed: boolean;
  /** For the log and the error message. Never a leak on its own. */
  reason: "owner" | "everyone" | "followers" | "not a follower" | "nobody" | "anonymous";
};

/**
 * The decision, given the facts. Pure, so it can be tested directly.
 *
 * The author is always allowed: a setting that stops the author from commenting
 * on their own post is not a setting anyone wants.
 */
export function audienceAllows(
  audience: Audience,
  facts: { isOwner: boolean; follows: boolean; signedIn: boolean }
): AudienceCheck {
  if (facts.isOwner) return { allowed: true, reason: "owner" };
  if (audience === "EVERYONE") return { allowed: true, reason: "everyone" };
  if (audience === "NOBODY") return { allowed: false, reason: "nobody" };
  // FOLLOWERS
  if (!facts.signedIn) return { allowed: false, reason: "anonymous" };
  return facts.follows ? { allowed: true, reason: "followers" } : { allowed: false, reason: "not a follower" };
}

/** Does the viewer follow the author? An accepted request, not a pending one. */
async function followsAuthor(viewerId: string | null, authorId: string): Promise<boolean> {
  if (!viewerId || viewerId === authorId) return false;
  const f = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: authorId } },
    select: { status: true }
  });
  return f?.status === "ACCEPTED";
}

/**
 * Check one of the three settings against a post.
 *
 * `which` names the column, so a caller cannot accidentally read the wrong one.
 */
export async function canActOnPost(
  viewerId: string | null,
  postId: string,
  which: "whoCanComment" | "whoCanShare" | "whoCanReshare"
): Promise<AudienceCheck & { postExists: boolean }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, whoCanComment: true, whoCanShare: true, whoCanReshare: true }
  });
  if (!post) return { allowed: false, reason: "nobody", postExists: false };

  const audience = audienceFrom(post[which]);
  const isOwner = Boolean(viewerId) && viewerId === post.authorId;
  const follows = isOwner ? false : await followsAuthor(viewerId, post.authorId);

  const decision = audienceAllows(audience, { isOwner, follows, signedIn: Boolean(viewerId) });
  return { ...decision, postExists: true };
}
