import { prisma } from "./prisma";
import { getSettingsOptional } from "./settings";
import { resolveDisplay, type PostDisplay } from "./postDisplay";
import { primaryState, type PrimaryState } from "./connect";

/**
 * Server-side helpers for the post display settings. Kept apart from
 * postDisplay.ts so that file stays pure and testable without a database.
 */

/** The resolved display preferences for a viewer, or the defaults. */
export async function loadDisplay(userId?: string | null): Promise<PostDisplay> {
  const settings = await getSettingsOptional(userId);
  return resolveDisplay(settings);
}

const RANK: Record<PrimaryState, number> = { NONE: 0, PENDING_OUT: 1, PENDING_IN: 2, ACTIVE: 3 };

/**
 * Where the viewer stands with each author, for the primary button.
 *
 * One query covers both directions, and when several rows exist for the same
 * pair the most actionable state wins: an incoming request (PENDING_IN) beats
 * one the viewer sent, and an active connection beats both.
 */
export async function primaryStatesFor(
  userId: string | undefined | null,
  authorIds: string[]
): Promise<Map<string, PrimaryState>> {
  const out = new Map<string, PrimaryState>();
  if (!userId || authorIds.length === 0) return out;

  const unique = [...new Set(authorIds)];
  for (const id of unique) out.set(id, "NONE");

  const rows = await prisma.follow.findMany({
    where: {
      OR: [
        { followerId: userId, followeeId: { in: unique } },
        { followerId: { in: unique }, followeeId: userId }
      ]
    },
    select: { followerId: true, followeeId: true, status: true, kind: true }
  });

  for (const row of rows) {
    const other = row.followerId === userId ? row.followeeId : row.followerId;
    const state = primaryState(row, userId, other);
    const current = out.get(other) ?? "NONE";
    if (RANK[state] > RANK[current]) out.set(other, state);
  }

  return out;
}
