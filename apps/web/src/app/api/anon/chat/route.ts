import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logActivity, logSecurity } from "@/lib/loggerServer";
import {
  chatLabel,
  describeRemaining,
  isWellFormedKey,
  keyKind,
  modeForKey,
  normaliseKey,
  isExpired
} from "@/lib/anon";

/**
 * Start, or join, an anonymous chat.
 *
 * The key decides everything:
 *
 *   SGX-…  a fixed key   -> a permanent chat, between the two of you, which
 *                           stays until someone deletes it.
 *   SGT-…  a temp key    -> a temporary chat. The first use creates it; every
 *                           later use joins the same one, which is how a
 *                           temporary group forms. When the key's time is up
 *                           the chat is deleted from both sides.
 */

const Body = z.object({ key: z.string().min(4).max(60) });

const CHAT_SELECT = {
  id: true,
  kind: true,
  mode: true,
  title: true,
  expiresAt: true,
  status: true,
  createdAt: true
} as const;

export const GET = withLogging("anon:chat:list", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.anonChat.findMany({
    where: {
      status: "ACTIVE",
      participants: { some: { userId } },
      // An expired chat is gone even if the sweeper has not reached it yet.
      OR: [{ mode: "PERMANENT" }, { expiresAt: { gt: new Date() } }]
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      ...CHAT_SELECT,
      participants: { select: { userId: true }, take: 50 },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, kind: true, createdAt: true } }
    }
  });

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    mode: r.mode,
    label: chatLabel(r),
    expiresAt: r.expiresAt,
    remaining: describeRemaining(r.expiresAt),
    memberCount: r.participants.length,
    last: r.messages[0] ?? null
  }));

  return NextResponse.json({ items });
});

export const POST = withLogging("anon:chat:start", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const key = normaliseKey(parsed.data.key);
  if (!isWellFormedKey(key)) {
    // Deliberately the same answer as "no such key": a well-formed but unknown
    // key and a malformed one should not be tellable apart from outside.
    return NextResponse.json({ error: "That key does not open a chat." }, { status: 404 });
  }

  const kind = keyKind(key);
  const mode = modeForKey(kind);
  if (!mode) return NextResponse.json({ error: "That key does not open a chat." }, { status: 404 });

  // ---------------------------------------------------------------- fixed key
  if (kind === "FIXED") {
    const identity = await prisma.anonIdentity.findUnique({
      where: { key },
      select: { userId: true, revokedAt: true }
    });
    if (!identity || identity.revokedAt) {
      return NextResponse.json({ error: "That key does not open a chat." }, { status: 404 });
    }
    if (identity.userId === userId) {
      return NextResponse.json({ error: "That is your own key." }, { status: 400 });
    }

    // One permanent direct chat per pair, so using the key twice opens the same
    // conversation rather than a second empty one.
    const existing = await prisma.anonChat.findFirst({
      where: {
        kind: "DIRECT",
        mode: "PERMANENT",
        status: "ACTIVE",
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: identity.userId } } }
        ]
      },
      select: CHAT_SELECT
    });
    if (existing) return NextResponse.json({ chat: existing, joined: true });

    const chat = await prisma.anonChat.create({
      data: {
        kind: "DIRECT",
        mode: "PERMANENT",
        ownerId: identity.userId,
        participants: { create: [{ userId: identity.userId, role: "OWNER" }, { userId, role: "MEMBER" }] }
      },
      select: CHAT_SELECT
    });

    logActivity("anon chat started", { userId, metadata: { mode: "PERMANENT" } });
    return NextResponse.json({ chat, joined: false }, { status: 201 });
  }

  // ------------------------------------------------------------- temporary key
  const temp = await prisma.anonTempKey.findUnique({
    where: { key },
    select: { id: true, ownerId: true, chatId: true, used: true, expiresAt: true, durationSec: true }
  });
  if (!temp) return NextResponse.json({ error: "That key does not open a chat." }, { status: 404 });
  if (temp.expiresAt.getTime() <= Date.now()) {
    logSecurity("anon temp key used after expiry", { userId, metadata: { keyId: temp.id } });
    return NextResponse.json({ error: "That key has expired." }, { status: 410 });
  }
  if (temp.ownerId === userId) {
    return NextResponse.json({ error: "That is your own key." }, { status: 400 });
  }

  // Already opened: join the chat it opened. This is how a temporary group
  // forms - one key, several people, all inside the same window.
  if (temp.used && temp.chatId) {
    const chat = await prisma.anonChat.findUnique({ where: { id: temp.chatId }, select: CHAT_SELECT });
    if (!chat || chat.status !== "ACTIVE" || isExpired(chat)) {
      return NextResponse.json({ error: "That key has expired." }, { status: 410 });
    }
    await prisma.anonParticipant.upsert({
      where: { chatId_userId: { chatId: chat.id, userId } },
      create: { chatId: chat.id, userId, role: "MEMBER" },
      update: {}
    });
    return NextResponse.json({ chat, joined: true });
  }

  // First use: open the chat, bound to this key and to the key's expiry.
  const chat = await prisma.$transaction(async (tx) => {
    const created = await tx.anonChat.create({
      data: {
        kind: "DIRECT",
        mode: "TEMPORARY",
        ownerId: temp.ownerId,
        expiresAt: temp.expiresAt,
        participants: { create: [{ userId: temp.ownerId, role: "OWNER" }, { userId, role: "MEMBER" }] }
      },
      select: CHAT_SELECT
    });
    await tx.anonTempKey.update({
      where: { id: temp.id },
      data: { used: true, usedAt: new Date(), chatId: created.id }
    });
    return created;
  });

  logActivity("anon chat started", {
    userId,
    metadata: { mode: "TEMPORARY", durationSec: temp.durationSec }
  });
  return NextResponse.json({ chat, joined: false }, { status: 201 });
});
