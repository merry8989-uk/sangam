import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";

// Room details plus who is in it.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const viewerId = await getViewerId(req);
  const room = await prisma.room.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      participants: {
        where: { leftAt: null },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
      }
    }
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    room: {
      id: room.id,
      kind: room.kind,
      name: room.name,
      joinCode: room.joinCode,
      status: room.status,
      visibility: room.visibility,
      isLive: room.isLive,
      hlsPlaybackUrl: room.hlsPlaybackUrl,
      peakViewers: room.peakViewers,
      startedAt: room.startedAt,
      endedAt: room.endedAt,
      owner: room.owner,
      isOwner: viewerId === room.ownerId,
      participants: room.participants.map((p) => ({ role: p.role, user: p.user }))
    }
  });
}
