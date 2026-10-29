import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logAudit } from "@/lib/loggerServer";
import { loadChat } from "@/lib/anonAccess";

/**
 * Add someone to a group chat.
 *
 * The owner adds; everyone else is a member. Adding a third person turns a direct
 * chat into a group, which is the only difference between the two - the same
 * table, the same messages, one more participant.
 *
 * A temporary group keeps its expiry: adding someone does not extend it.
 */
export const POST = withLogging("anon:chat:add", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await loadChat(userId, params.id);
  if (!access.ok || !access.chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.isOwner) return NextResponse.json({ error: "Only the owner can add people." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const target = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!target) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { id: target }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "No such account" }, { status: 404 });

  await prisma.anonParticipant.upsert({
    where: { chatId_userId: { chatId: params.id, userId: target } },
    create: { chatId: params.id, userId: target, role: "MEMBER" },
    update: {}
  });

  const count = await prisma.anonParticipant.count({ where: { chatId: params.id } });
  if (count > 2) {
    await prisma.anonChat.update({ where: { id: params.id }, data: { kind: "GROUP" } });
  }

  logAudit({ userId, action: "add_member", resource: "anon_chat", resourceId: params.id, metadata: { members: count } });
  return NextResponse.json({ ok: true, members: count, kind: count > 2 ? "GROUP" : "DIRECT" });
});
