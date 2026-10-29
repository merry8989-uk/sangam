import { prisma } from "./prisma";
import { chatState, isExpired } from "./anon";

/**
 * Who may see or write to an anonymous chat.
 *
 * One rule, used by every chat route, so a read and a write cannot disagree.
 * Two things are checked before anything else, in this order:
 *
 *   1. Is the viewer a participant? An anonymous chat has no public surface at
 *      all - there is no id anyone can guess their way into.
 *   2. Has it expired? A temporary chat that is past its time must look gone
 *      even if the sweeper has not run yet, or the promise made when the key was
 *      minted is only true to the minute.
 */

export type ChatAccess = {
  ok: boolean;
  /** Why not, for the log. The client is told "not found" either way. */
  reason: "not a participant" | "expired" | "deleted" | "no such chat" | "ok";
  chat?: {
    id: string;
    kind: string;
    mode: string;
    ownerId: string;
    title: string | null;
    expiresAt: Date | null;
    status: string;
    callRoomId: string | null;
    createdAt: Date;
  };
  isOwner: boolean;
};

/** Load a chat and decide whether this viewer may use it. */
export async function loadChat(viewerId: string | null, chatId: string): Promise<ChatAccess> {
  if (!viewerId) return { ok: false, reason: "not a participant", isOwner: false };

  const chat = await prisma.anonChat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      kind: true,
      mode: true,
      ownerId: true,
      title: true,
      expiresAt: true,
      status: true,
      callRoomId: true,
      createdAt: true,
      participants: { where: { userId: viewerId }, select: { id: true } }
    }
  });

  if (!chat) return { ok: false, reason: "no such chat", isOwner: false };
  if (chat.participants.length === 0) return { ok: false, reason: "not a participant", isOwner: false };

  const state = chatState(chat, new Date());
  if (!state.live) {
    return {
      ok: false,
      reason: state.expired ? "expired" : "deleted",
      chat,
      isOwner: chat.ownerId === viewerId
    };
  }

  const { participants: _p, ...rest } = chat;
  void _p;
  return { ok: true, reason: "ok", chat: rest, isOwner: chat.ownerId === viewerId };
}

/** The participants of a chat, as the screen needs them. No names - it is anonymous. */
export async function chatMembers(chatId: string): Promise<{ userId: string; role: string; joinedAt: Date }[]> {
  return prisma.anonParticipant.findMany({
    where: { chatId },
    select: { userId: true, role: true, joinedAt: true },
    orderBy: { joinedAt: "asc" }
  });
}

/** Is this chat past its time? Used before every write. */
export function chatIsGone(chat: { mode: string; expiresAt: Date | null; status: string }): boolean {
  return chat.status !== "ACTIVE" || isExpired(chat);
}
