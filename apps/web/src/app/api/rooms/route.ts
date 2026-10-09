import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { newJoinCode, ROOM_KINDS } from "@/lib/rooms";
import { roomNameFor, livekitConfigured } from "@/lib/livekit";
import { createIngress } from "@/lib/livekitAdmin";
import { getSettingsOptional } from "@/lib/settings";

const CreateBody = z.object({
  kind: z.enum(ROOM_KINDS),
  name: z.string().min(1).max(120).optional(),
  visibility: z.enum(["PRIVATE", "FOLLOWERS", "PUBLIC"]).default("PRIVATE")
});

// List the rooms you own or joined, plus any public live streams.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  const kind = new URL(req.url).searchParams.get("kind");

  const where = kind
    ? { kind, OR: [{ status: "ACTIVE" as const }, { status: "ENDED" as const }] }
    : { OR: [{ status: "ACTIVE" as const }, { status: "ENDED" as const }] };

  const rooms = await prisma.room.findMany({
    where: userId
      ? { ...where, OR: [{ ownerId: userId }, { participants: { some: { userId } } }, { visibility: "PUBLIC" }] }
      : { ...where, visibility: "PUBLIC" },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { owner: { select: { username: true, displayName: true } } }
  });

  return NextResponse.json({
    items: rooms.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      joinCode: r.joinCode,
      status: r.status,
      visibility: r.visibility,
      isLive: r.isLive,
      hlsPlaybackUrl: r.hlsPlaybackUrl,
      startedAt: r.startedAt,
      owner: r.owner
    })),
    livekitConfigured: livekitConfigured()
  });
}

// Create a room: a 1:1 call, a meeting, or a live stream.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, visibility } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, displayName: true } });
  const settings = await getSettingsOptional(userId);

  const defaultName =
    kind === "LIVE"
      ? (settings?.liveDefaultTitle || `${user?.displayName ?? "Someone"} is live`)
      : kind === "CALL"
        ? `Call with ${user?.displayName ?? "someone"}`
        : `${user?.displayName ?? "Someone"}'s meeting`;

  const room = await prisma.room.create({
    data: {
      kind,
      name: parsed.data.name || defaultName,
      ownerId: userId,
      joinCode: newJoinCode(),
      visibility,
      isLive: kind === "LIVE"
    }
  });

  // A live stream also needs an RTMP ingress so a phone or laptop can push to it.
  if (kind === "LIVE" && livekitConfigured()) {
    try {
      const ing = await createIngress(roomNameFor(room.id), userId, user?.displayName ?? user?.username ?? "host");
      const updated = await prisma.room.update({
        where: { id: room.id },
        data: {
          ingressId: ing.ingress_id,
          rtmpUrl: ing.url,
          hlsPlaybackUrl: ing.hls_playlist_url ?? null
        }
      });
      return NextResponse.json(
        { room: updated, rtmp: { url: ing.url, key: ing.stream_key } },
        { status: 201 }
      );
    } catch {
      // The room still exists; the host can retry starting the stream.
      return NextResponse.json({ room, warning: "Ingress could not be created" }, { status: 201 });
    }
  }

  return NextResponse.json({ room }, { status: 201 });
}
