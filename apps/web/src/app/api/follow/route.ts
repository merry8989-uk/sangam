import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { isBlockedEitherWay } from "@/lib/filters";

/**
 * The primary interaction between two people.
 *
 *   follow / unfollow        - a plain follow, active immediately
 *   subscribe / unsubscribe  - a channel subscription, stored as kind SUBSCRIBE
 *   connect                  - a request, stored as kind CONNECT at PENDING
 *   accept / cancel          - answer or withdraw a pending connect request
 *   disconnect               - drop a connection from both sides
 *
 * All of them live on the Follow row, so the follow graph, the block checks and
 * the notifications carry over unchanged.
 */
const Body = z.object({
  targetId: z.string(),
  action: z.enum([
    "follow",
    "unfollow",
    "subscribe",
    "unsubscribe",
    "connect",
    "accept",
    "cancel",
    "disconnect"
  ])
});

export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { targetId, action } = parsed.data;

  if (targetId === userId) return NextResponse.json({ error: "Cannot do that to yourself" }, { status: 400 });
  if (await isBlockedEitherWay(userId, targetId)) {
    return NextResponse.json({ error: "Cannot do that to this user" }, { status: 403 });
  }

  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true }
  });
  const actorUsername = actor?.username ?? "";

  switch (action) {
    case "follow": {
      await prisma.follow.upsert({
        where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
        update: { status: "ACCEPTED", kind: "FOLLOW" },
        create: { followerId: userId, followeeId: targetId, status: "ACCEPTED", kind: "FOLLOW" }
      });
      await notify(targetId, "follow", { actorId: userId, actorUsername });
      break;
    }

    case "unfollow": {
      await prisma.follow.deleteMany({ where: { followerId: userId, followeeId: targetId } });
      break;
    }

    case "subscribe": {
      await prisma.follow.upsert({
        where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
        update: { status: "ACCEPTED", kind: "SUBSCRIBE" },
        create: { followerId: userId, followeeId: targetId, status: "ACCEPTED", kind: "SUBSCRIBE" }
      });
      await notify(targetId, "subscribe", { actorId: userId, actorUsername });
      break;
    }

    case "unsubscribe": {
      await prisma.follow.deleteMany({
        where: { followerId: userId, followeeId: targetId, kind: "SUBSCRIBE" }
      });
      break;
    }

    case "connect": {
      // Never downgrade a follow that is already active.
      const existing = await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
        select: { status: true }
      });
      if (existing?.status !== "ACCEPTED") {
        await prisma.follow.upsert({
          where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
          update: { status: "PENDING", kind: "CONNECT" },
          create: { followerId: userId, followeeId: targetId, status: "PENDING", kind: "CONNECT" }
        });
        await notify(targetId, "connect", { actorId: userId, actorUsername });
      }
      break;
    }

    case "accept": {
      // The request we are answering points the other way.
      const request = await prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: targetId, followeeId: userId } },
        select: { status: true }
      });
      if (request?.status !== "PENDING") {
        return NextResponse.json({ error: "No pending request" }, { status: 409 });
      }
      // Accepting connects you both, so both directions become active.
      await prisma.$transaction([
        prisma.follow.update({
          where: { followerId_followeeId: { followerId: targetId, followeeId: userId } },
          data: { status: "ACCEPTED" }
        }),
        prisma.follow.upsert({
          where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
          update: { status: "ACCEPTED", kind: "CONNECT" },
          create: { followerId: userId, followeeId: targetId, status: "ACCEPTED", kind: "CONNECT" }
        })
      ]);
      await notify(targetId, "connect", { actorId: userId, actorUsername });
      break;
    }

    case "cancel": {
      await prisma.follow.deleteMany({
        where: { followerId: userId, followeeId: targetId, status: "PENDING" }
      });
      break;
    }

    case "disconnect": {
      await prisma.$transaction([
        prisma.follow.deleteMany({ where: { followerId: userId, followeeId: targetId } }),
        prisma.follow.deleteMany({ where: { followerId: targetId, followeeId: userId } })
      ]);
      break;
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targetId = new URL(req.url).searchParams.get("targetId");
  if (!targetId) return NextResponse.json({ error: "targetId required" }, { status: 400 });

  const [outgoing, incoming] = await Promise.all([
    prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
      select: { status: true, kind: true }
    }),
    prisma.follow.findUnique({
      where: { followerId_followeeId: { followerId: targetId, followeeId: userId } },
      select: { status: true, kind: true }
    })
  ]);

  return NextResponse.json({ outgoing, incoming });
}
