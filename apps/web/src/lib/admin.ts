import { prisma } from "./prisma";
import { logSecurity } from "./loggerServer";

/**
 * Who may read the logs.
 *
 * The log tables hold a record of who did what across the whole product, so
 * reading them is an operator privilege, not a user one. There was no such
 * check before this: the ops page was described as admin-only in a comment and
 * nothing enforced it.
 */

/** Roles that may read logs and the ops views. */
export const OPERATOR_ROLES = ["ADMIN"] as const;

export function isOperatorRole(role: string | null | undefined): boolean {
  return typeof role === "string" && (OPERATOR_ROLES as readonly string[]).includes(role);
}

/** The role of a signed-in user, or null. */
export async function roleOf(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}

export async function isOperator(userId: string | null | undefined): Promise<boolean> {
  return isOperatorRole(await roleOf(userId));
}

/**
 * Refuse a request from someone who is not an operator, and record the refusal.
 *
 * A refused attempt to read the logs is itself worth logging: a run of them is
 * the shape of someone looking for a way in.
 */
export async function denyNonOperator(
  userId: string | null | undefined,
  source: string
): Promise<{ denied: true } | { denied: false }> {
  if (await isOperator(userId)) return { denied: false };
  logSecurity(`${source} refused: not an operator`, {
    source,
    userId: userId ?? null,
    metadata: { signedIn: Boolean(userId) }
  });
  return { denied: true };
}
