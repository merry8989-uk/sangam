import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { roomNameFor } from "@/lib/livekit";
import { deleteIngress, deleteRoom } from "@/lib/livekitAdmin";

// End a room. Only the host may do this.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const room = await prisma.room.findUnique({
    where: { id: params.id },
    select: { ownerId: true, ingressId: true, kind: true }
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.ownerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (room.ingressId) await deleteIngress(room.ingressId);
  await deleteRoom(roomNameFor(params.id));

  await prisma.room.update({
    where: { id: params.id },
    data: { status: "ENDED", endedAt: new Date(), isLive: false }
  });
  await prisma.roomParticipant.updateMany({ where: { roomId: params.id, leftAt: null }, data: { leftAt: new Date() } });

  return NextResponse.json({ ok: true });
}
