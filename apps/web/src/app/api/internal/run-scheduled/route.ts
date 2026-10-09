import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sarvamChat } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/agent";
import { matchesCron } from "@/lib/schedule";

// Runs each agent's due scheduled tasks and stores the result as a chat
// session, so the owner sees it under recent chats.
// Call this from a scheduler every minute (see docs/JOBS.md).
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  const agents = await prisma.agent.findMany();
  let ran = 0;

  for (const agent of agents) {
    const tasks = Array.isArray(agent.scheduledTasks)
      ? (agent.scheduledTasks as { cron?: string; prompt?: string }[])
      : [];
    for (const task of tasks) {
      if (!task?.cron || !task?.prompt) continue;
      if (!matchesCron(task.cron, now)) continue;

      // one run per task per minute, even if the endpoint is hit repeatedly
      const dedupe = `sched:run:${agent.id}:${task.cron}:${minuteKey}`;
      const first = await redis.set(dedupe, "1", "EX", 120, "NX");
      if (!first) continue;

      try {
        const reply = await sarvamChat([{ role: "user", content: task.prompt }], {
          system: await buildSystemPrompt(agent, task.prompt),
          model: agent.model
        });
        const chat = await prisma.chatSession.create({
          data: {
            userId: agent.userId,
            agentId: agent.id,
            title: `[scheduled] ${task.prompt.slice(0, 50)}`
          }
        });
        await prisma.chatMessage.createMany({
          data: [
            { sessionId: chat.id, role: "user", content: task.prompt },
            { sessionId: chat.id, role: "assistant", content: reply.content }
          ]
        });
        ran += 1;
      } catch {
        /* skip a failing task rather than abort the batch */
      }
    }
  }

  return NextResponse.json({ ran, checked: agents.length });
}
