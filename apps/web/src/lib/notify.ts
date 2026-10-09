import { prisma } from "./prisma";

export type NotifyType = "like" | "comment" | "follow" | "message";

type NotifyPayload = {
  actorId: string;
  actorUsername: string;
  postId?: string;
  conversationId?: string;
  preview?: string;
};

// Create a notification, never for your own action. Best effort: a failure to
// notify must never break the action that triggered it.
export async function notify(userId: string, type: NotifyType, payload: NotifyPayload): Promise<void> {
  if (!userId || userId === payload.actorId) return;
  try {
    await prisma.notification.create({ data: { userId, type, payload } });
  } catch {
    /* ignore */
  }
}
