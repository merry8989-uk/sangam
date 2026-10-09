import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Streaming chat. Forwards Sarvam's SSE to the browser and, while doing so,
// accumulates the reply so it can be persisted once the stream completes.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return json({ error: "Invalid input" }, 400);
  const { messages, sessionId, useAgent, model } = parsed.data;

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let system: string | undefined;
  if (userId && useAgent) {
    const agent = await getAgentForUser(userId);
    if (agent) system = buildSystemPrompt(agent);
  }

  const base = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system, model })
    });
  } catch {
    return json({ error: "Chat service unavailable" }, 502);
  }
  if (!upstream.ok || !upstream.body) return json({ error: "Chat service error" }, 502);

  const reader = upstream.body.getReader();
  let acc = "";

  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const data = t.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const j = JSON.parse(data);
              const delta = j?.choices?.[0]?.delta?.content;
              if (delta) acc += delta;
            } catch {
              /* partial chunk */
            }
          }
        }
      } finally {
        controller.close();
      }

      if (userId && acc) {
        try {
          let chat = sessionId
            ? await prisma.chatSession.findFirst({ where: { id: sessionId, userId } })
            : null;
          if (!chat) {
            chat = await prisma.chatSession.create({
              data: { userId, title: messages[messages.length - 1].content.slice(0, 60) || "New chat" }
            });
          }
          await prisma.chatMessage.createMany({
            data: [
              { sessionId: chat.id, role: "user", content: messages[messages.length - 1].content },
              { sessionId: chat.id, role: "assistant", content: acc }
            ]
          });
          await prisma.chatSession.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
        } catch {
          /* persistence is best effort */
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
