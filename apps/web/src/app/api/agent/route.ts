import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureAgent } from "@/lib/agent";

const Body = z.object({
  name: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  systemPrompt: z.string().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  skills: z.array(z.string().max(60)).max(50).optional(),
  knowledgeBase: z
    .array(z.object({ title: z.string().max(120), content: z.string().max(4000) }))
    .max(50)
    .optional(),
  scheduledTasks: z
    .array(z.object({ cron: z.string().max(60), prompt: z.string().max(2000) }))
    .max(20)
    .optional(),
  connectors: z
    .array(z.object({ name: z.string().max(60), type: z.string().max(60) }))
    .max(20)
    .optional(),
  isPublic: z.boolean().optional()
});

// One agent per user - created on first read.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agent = await ensureAgent(userId);
  return NextResponse.json({ agent });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await ensureAgent(userId);
  const agent = await prisma.agent.update({ where: { userId }, data: parsed.data });
  return NextResponse.json({ agent });
}
