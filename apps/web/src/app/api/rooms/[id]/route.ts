import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";

// Room details plus who is in it.
export const GET = withLogging("rooms:id:get", async (req: Request, { params }: { params: { id: string } }) => {
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

  // The join code is the invitation to a private room, so it is not public
  // information: only the host and people already in the room may see it.
  // This route used to hand it to any caller who knew the room id.
  const isOwner = viewerId === room.ownerId;
  const isParticipant = Boolean(viewerId) && room.participants.some((p) => p.user.id === viewerId);
  const maySeeInvite = isOwner || isParticipant;
  const isPrivate = room.visibility !== "PUBLIC";
  const maySeeWho = !isPrivate || maySeeInvite;

  return NextResponse.json({
    room: {
      id: room.id,
      kind: room.kind,
      name: room.name,
      joinCode: maySeeInvite ? room.joinCode : null,
      status: room.status,
      visibility: room.visibility,
      isLive: room.isLive,
      hlsPlaybackUrl: room.hlsPlaybackUrl,
      peakViewers: room.peakViewers,
      startedAt: room.startedAt,
      endedAt: room.endedAt,
      owner: room.owner,
      isOwner,
      // A private room's guest list is not for strangers either.
      participants: maySeeWho ? room.participants.map((p) => ({ role: p.role, user: p.user })) : [],
      canSeeInvite: maySeeInvite
    }
  });
});
