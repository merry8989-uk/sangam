import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { roomNameFor, livekitConfigured } from "@/lib/livekit";
import { createIngress, deleteIngress } from "@/lib/livekitAdmin";

const Body = z.object({ action: z.enum(["start", "stop"]) });

// Start or stop the RTMP ingest for a live room.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const room = await prisma.room.findUnique({ where: { id: params.id } });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.ownerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (room.kind !== "LIVE") return NextResponse.json({ error: "Not a live room" }, { status: 400 });
  if (!livekitConfigured()) return NextResponse.json({ error: "LiveKit is not configured" }, { status: 503 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });

  if (parsed.data.action === "start") {
    if (room.ingressId) {
      return NextResponse.json({ room, alreadyLive: true });
    }
    try {
      const ing = await createIngress(roomNameFor(room.id), userId, user?.displayName ?? user?.username ?? "host");
      const updated = await prisma.room.update({
        where: { id: room.id },
        data: {
          ingressId: ing.ingress_id,
          rtmpUrl: ing.url,
          hlsPlaybackUrl: ing.hls_playlist_url ?? null,
          isLive: true
        }
      });
      return NextResponse.json({ room: updated, rtmp: { url: ing.url, key: ing.stream_key } });
    } catch {
      return NextResponse.json({ error: "Could not start the ingest" }, { status: 502 });
    }
  }

  if (room.ingressId) await deleteIngress(room.ingressId);
  const updated = await prisma.room.update({
    where: { id: room.id },
    data: { ingressId: null, isLive: false, rtmpUrl: null, hlsPlaybackUrl: null }
  });
  return NextResponse.json({ room: updated });
}
