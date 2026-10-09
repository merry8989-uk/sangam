import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { dmChannel, redis } from "@/lib/redis";

async function membership(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } }
  });
}

// GET /api/dm/[id] - the thread. Marks it read for the caller.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await membership(params.id, userId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      participants: {
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 }
    }
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: params.id, userId } },
    data: { lastReadAt: new Date() }
  });

  const other = conversation.participants.find((p) => p.userId !== userId)?.user ?? null;
  return NextResponse.json({ other, messages: conversation.messages });
}

const SendBody = z.object({ body: z.string().min(1).max(4000) });

// POST /api/dm/[id] - send a message.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await membership(params.id, userId);
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = SendBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const message = await prisma.directMessage.create({
    data: { conversationId: params.id, senderId: userId, body: parsed.data.body }
  });
  await prisma.conversation.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

  // Push it to anyone streaming this conversation.
  try {
    await redis.publish(dmChannel(params.id), JSON.stringify(message));
  } catch {
    /* live delivery is best effort; the thread also re-fetches */
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: params.id, userId: { not: userId } },
    select: { userId: true }
  });
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (actor) {
    for (const p of participants) {
      await notify(p.userId, "message", {
        actorId: userId,
        actorUsername: actor.username,
        conversationId: params.id,
        preview: parsed.data.body.slice(0, 80)
      });
    }
  }

  return NextResponse.json(message, { status: 201 });
}
