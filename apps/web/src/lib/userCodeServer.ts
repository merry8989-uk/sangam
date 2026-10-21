import { prisma } from "./prisma";
import { ANONYMOUS_CODE, generateUserCode } from "./userCode";

/**
 * Get this account's code, creating one if it has none.
 *
 * Kept out of userCode.ts so that file stays pure and testable.
 *
 * Two things this has to get right:
 *
 *  - It is safe to call concurrently. Two requests arriving at once for the
 *    same new account must not end up with two codes, and must not end up
 *    overwriting each other in a loop. The unique index is the arbiter: the
 *    loser of the race re-reads and takes the winner's code rather than
 *    generating another.
 *  - It never changes an existing code. A code that moves is worse than no code
 *    at all, because a support thread is already quoting it.
 */
export async function ensureUserCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { code: true }
  });
  if (existing?.code) return existing.code;
  if (!existing) return ANONYMOUS_CODE;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateUserCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { code },
        select: { code: true }
      });
      return updated.code ?? code;
    } catch {
      // Either the code collided, or another request set one first. Re-read:
      // if the account now has a code, that one is the truth.
      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { code: true }
      });
      if (after?.code) return after.code;
    }
  }
  return ANONYMOUS_CODE;
}

/** The code if there is one, without creating it. For read-only views. */
export async function peekUserCode(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { code: true } });
  return user?.code ?? null;
}
