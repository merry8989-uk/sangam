import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { canJoinRoom, canPublish } from "@/lib/rooms";
import { roomNameFor, mintToken, LIVEKIT_URL, livekitConfigured } from "@/lib/livekit";

// Join a room: records participation and hands back a LiveKit token.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const hasJoinCode = typeof body?.code === "string" && body.code.length > 0;

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: { owner: { select: { id: true, username: true } } }
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "ACTIVE") return NextResponse.json({ error: "This room has ended" }, { status: 410 });

  const isOwner = room.ownerId === userId;
  const followsOwner = isOwner
    ? false
    : Boolean(
        await prisma.follow.findUnique({
          where: { followerId_followeeId: { followerId: userId, followeeId: room.ownerId } }
        })
      );

  const decision = canJoinRoom({
    kind: room.kind,
    visibility: room.visibility,
    isOwner,
    followsOwner,
    viewerId: userId,
    hasJoinCode: hasJoinCode || isOwner
  });
  if (!decision.ok) return NextResponse.json({ error: decision.reason ?? "Forbidden" }, { status: 403 });

  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId: room.id, userId } },
    create: { roomId: room.id, userId, role: decision.role },
    update: { role: decision.role, leftAt: null }
  });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
  const canPub = canPublish(decision.role, room.kind);

  if (!livekitConfigured()) {
    return NextResponse.json({
      role: decision.role,
      roomName: roomNameFor(room.id),
      token: null,
      wsUrl: null,
      warning: "LiveKit is not configured on the server."
    });
  }

  const token = mintToken({
    identity: userId,
    name: user?.displayName ?? user?.username ?? "guest",
    room: roomNameFor(room.id),
    canPublish: canPub,
    canSubscribe: true
  });

  return NextResponse.json({
    role: decision.role,
    roomName: roomNameFor(room.id),
    token,
    wsUrl: LIVEKIT_URL,
    canPublish: canPub
  });
}
