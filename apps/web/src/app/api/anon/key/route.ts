import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logAudit } from "@/lib/loggerServer";
import { newFixedKey } from "@/lib/anon";

/**
 * The fixed key: one per account, permanent.
 *
 * A chat opened with it is a normal chat - it stays until someone deletes it.
 * That is the difference from a temporary key, and it is the whole reason the
 * two exist separately.
 */

/** My fixed key, minted on first ask. */
export const GET = withLogging("anon:key", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let identity = await prisma.anonIdentity.findUnique({ where: { userId } });
  if (!identity || identity.revokedAt) {
    identity = await prisma.anonIdentity.upsert({
      where: { userId },
      create: { userId, key: newFixedKey() },
      update: { key: newFixedKey(), revokedAt: null }
    });
    logAudit({ userId, action: "mint", resource: "anon_fixed_key" });
  }

  return NextResponse.json({ key: identity.key, createdAt: identity.createdAt });
});

/**
 * Retire the key and mint a new one.
 *
 * The old key stops opening new chats immediately. Chats already started stay -
 * they are permanent, and a permanent chat does not depend on the key that
 * opened it. Anyone holding the old key simply cannot reach the person again.
 */
export const POST = withLogging("anon:key:rotate", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const identity = await prisma.anonIdentity.upsert({
    where: { userId },
    create: { userId, key: newFixedKey() },
    update: { key: newFixedKey(), revokedAt: new Date() }
  });
  logAudit({ userId, action: "rotate", resource: "anon_fixed_key" });
  return NextResponse.json({ key: identity.key, rotated: true });
});
