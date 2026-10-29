import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logActivity } from "@/lib/loggerServer";
import { loadChat } from "@/lib/anonAccess";
import { LIVEKIT_URL, livekitConfigured, mintToken, roomNameFor } from "@/lib/livekit";

/**
 * Start or join the call for this chat.
 *
 * A video call, an audio call, or a group call - it is the same room, and what
 * it is depends on what the participants publish. Video is on by default; a
 * participant who turns their camera off is on an audio call, and there is no
 * separate "audio call" endpoint to keep in step.
 *
 * Virtual backgrounds are applied on the client, in the video pipeline, so there
 * is nothing to configure here beyond allowing video.
 *
 * Anonymous means anonymous: the token's identity is a per-chat pseudonym, not
 * the account id, so a participant's name in the room does not reveal who they
 * are.
 */

const Body = z.object({
  // false for an audio-only call; the participant can still turn video on.
  video: z.boolean().optional()
});

export const POST = withLogging("anon:chat:call", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await loadChat(userId, params.id);
  if (!access.ok || !access.chat) {
    const gone = access.reason === "expired";
    return NextResponse.json({ error: gone ? "This chat has expired." : "Not found" }, { status: gone ? 410 : 404 });
  }

  if (!livekitConfigured()) {
    return NextResponse.json(
      { error: "Calls are not configured on this server.", livekit: false },
      { status: 503 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const video = parsed.success ? parsed.data.video !== false : true;

  // One room per chat, created on the first call and reused after. The room id
  // is stored on the chat so the next participant joins the same one.
  let roomId = access.chat.callRoomId;
  if (!roomId) {
    const room = await prisma.room.create({
      data: {
        kind: "CALL",
        name: `anon-${params.id.slice(0, 8)}`,
        ownerId: access.chat.ownerId,
        joinCode: params.id.slice(0, 8),
        visibility: "PRIVATE"
      },
      select: { id: true }
    });
    roomId = room.id;
    await prisma.anonChat.update({ where: { id: params.id }, data: { callRoomId: roomId } });
  }

  // A pseudonym, not the account id: the room must not leak who anyone is.
  const anonName = `guest-${userId.slice(-6)}`;

  const token = mintToken({
    identity: anonName,
    room: roomNameFor(roomId),
    canPublish: true,
    canSubscribe: true,
    // The camera grant is what makes it a video call; without it the same room
    // is an audio call.
    metadata: JSON.stringify({ video, anon: true })
  });

  logActivity("anon call joined", { userId, metadata: { chatId: params.id, video } });

  return NextResponse.json({ token, wsUrl: LIVEKIT_URL, roomId, video });
});
