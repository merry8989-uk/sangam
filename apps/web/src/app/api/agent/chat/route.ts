import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sarvamChat } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/agent";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(50),
  model: z.string().max(60).optional()
});

// The Agent API: anyone with an agent's key can run it from their own app.
//
//   curl -X POST https://<host>/api/agent/chat \
//     -H "Authorization: Bearer sangam_xxx" \
//     -H "Content-Type: application/json" \
//     -d '{"messages":[{"role":"user","content":"Hello"}]}'
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  const agent = await prisma.agent.findUnique({ where: { apiKey: key } });
  if (!agent) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const last = parsed.data.messages[parsed.data.messages.length - 1];
    const reply = await sarvamChat(parsed.data.messages, {
      system: await buildSystemPrompt(agent, last.content),
      model: parsed.data.model ?? agent.model
    });
    return NextResponse.json({
      content: reply.content,
      model: reply.model,
      agent: { name: agent.name }
    });
  } catch {
    return NextResponse.json({ error: "Chat service unavailable" }, { status: 502 });
  }
}
