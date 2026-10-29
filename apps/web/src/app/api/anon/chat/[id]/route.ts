import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logAudit } from "@/lib/loggerServer";
import { chatMembers, loadChat } from "@/lib/anonAccess";
import { chatLabel, describeRemaining } from "@/lib/anon";
import { deleteObject } from "@/lib/s3";

/** Read one chat and its messages. Participants only. */
export const GET = withLogging("anon:chat:read", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await loadChat(userId, params.id);
  // "not found" for every refusal: an anonymous chat must not confirm that it
  // exists to someone who is not in it.
  if (!access.ok || !access.chat) {
    const gone = access.reason === "expired";
    return NextResponse.json(
      { error: gone ? "This chat has expired." : "Not found", expired: gone },
      { status: gone ? 410 : 404 }
    );
  }

  const messages = await prisma.anonMessage.findMany({
    where: { chatId: params.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      senderId: true,
      kind: true,
      body: true,
      createdAt: true,
      attachments: { select: { id: true, storageKey: true, name: true, mimeType: true, sizeBytes: true, kind: true } }
    }
  });

  const members = await chatMembers(params.id);

  return NextResponse.json({
    chat: {
      id: access.chat.id,
      kind: access.chat.kind,
      mode: access.chat.mode,
      label: chatLabel(access.chat),
      expiresAt: access.chat.expiresAt,
      remaining: describeRemaining(access.chat.expiresAt),
      isOwner: access.isOwner,
      callRoomId: access.chat.callRoomId
    },
    members,
    messages
  });
});

/**
 * Destroy a chat.
 *
 * The owner deletes it for everyone; a member leaves it for themselves. Deleting
 * is a hard delete - the rows go, and so do the files. A temporary chat does this
 * to itself at expiry; this is how a permanent one ends, and how a temporary one
 * ends early.
 */
export const DELETE = withLogging("anon:chat:delete", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await loadChat(userId, params.id);
  if (!access.ok || !access.chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!access.isOwner) {
    // A member leaving. The chat survives for the others.
    await prisma.anonParticipant.deleteMany({ where: { chatId: params.id, userId } });
    logAudit({ userId, action: "leave", resource: "anon_chat", resourceId: params.id });
    return NextResponse.json({ left: true });
  }

  // The owner: take the files with it, then the rows.
  const attachments = await prisma.anonAttachment.findMany({
    where: { message: { chatId: params.id } },
    select: { storageKey: true }
  });
  for (const a of attachments) {
    try {
      await deleteObject(a.storageKey);
    } catch {
      // A missing object is not a reason to keep the rows.
    }
  }
  await prisma.anonChat.delete({ where: { id: params.id } });
  logAudit({ userId, action: "delete", resource: "anon_chat", resourceId: params.id, metadata: { files: attachments.length } });

  return NextResponse.json({ deleted: true, files: attachments.length });
});
