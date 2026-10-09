import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isBlockedEitherWay } from "@/lib/filters";

// GET /api/dm - my conversations, most recent first, with the other person,
// the last message and an unread count.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ items: [] });

  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    orderBy: { conversation: { updatedAt: "desc" } },
    include: {
      conversation: {
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });

  const items = await Promise.all(
    parts.map(async (p) => {
      const other = p.conversation.participants.find((q) => q.userId !== userId)?.user ?? null;
      const last = p.conversation.messages[0] ?? null;
      const unread = await prisma.directMessage.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {})
        }
      });
      return {
        id: p.conversationId,
        other,
        lastBody: last?.body ?? null,
        lastAt: last?.createdAt ?? null,
        unread
      };
    })
  );

  return NextResponse.json({ items });
}

const StartBody = z.object({ userId: z.string().min(1) });

// POST /api/dm - find or create the 1:1 conversation with another user.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = StartBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const target = parsed.data.userId;
  if (target === me) return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  if (await isBlockedEitherWay(me, target)) {
    return NextResponse.json({ error: "Cannot message this user" }, { status: 403 });
  }

  const candidates = await prisma.conversation.findMany({
    where: {
      AND: [{ participants: { some: { userId: me } } }, { participants: { some: { userId: target } } }]
    },
    include: { _count: { select: { participants: true } } }
  });
  const existing = candidates.find((c) => c._count.participants === 2);
  if (existing) return NextResponse.json({ conversationId: existing.id });

  const conversation = await prisma.conversation.create({
    data: { participants: { create: [{ userId: me }, { userId: target }] } }
  });
  return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
}
