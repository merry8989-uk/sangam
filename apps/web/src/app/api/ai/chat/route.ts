import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sarvamChat } from "@/lib/ai";
import { buildSystemPrompt, getAgentForUser } from "@/lib/agent";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(50),
  sessionId: z.string().optional(),
  useAgent: z.boolean().default(false),
  model: z.string().max(60).optional()
});

// Public chat endpoint - works with or without login.
// Logged-in users get their conversation persisted (and may use their agent).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { messages, sessionId, useAgent, model } = parsed.data;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let system: string | undefined;
  if (userId && useAgent) {
    const agent = await getAgentForUser(userId);
    if (agent) system = buildSystemPrompt(agent);
  }

  let reply;
  try {
    reply = await sarvamChat(messages, { system, model });
  } catch {
    return NextResponse.json(
      { error: "Chat service unavailable. Is SARVAM_API_KEY configured?" },
      { status: 502 }
    );
  }

  // Persist for signed-in users (best effort; never blocks the reply).
  let activeSessionId: string | null = null;
  if (userId) {
    try {
      let chat = sessionId
        ? await prisma.chatSession.findFirst({ where: { id: sessionId, userId } })
        : null;
      if (!chat) {
        chat = await prisma.chatSession.create({
          data: {
            userId,
            title: messages[messages.length - 1].content.slice(0, 60) || "New chat"
          }
        });
      }
      const lastUser = messages[messages.length - 1];
      await prisma.chatMessage.createMany({
        data: [
          { sessionId: chat.id, role: "user", content: lastUser.content },
          { sessionId: chat.id, role: "assistant", content: reply.content }
        ]
      });
      await prisma.chatSession.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
      activeSessionId = chat.id;
    } catch {
      // ignore persistence failures
    }
  }

  return NextResponse.json({ content: reply.content, model: reply.model, sessionId: activeSessionId });
}
