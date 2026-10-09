import { randomBytes } from "crypto";
import type { Agent } from "@prisma/client";
import { prisma } from "./prisma";

// One agent per user. The unique index on Agent.userId is the guarantee.

export function newAgentKey(): string {
  return "sangam_" + randomBytes(24).toString("hex");
}

const DEFAULT_PROMPT =
  "You are the assistant for Sangam, an India-first social and video platform. " +
  "Be concise and helpful. Reply in the user's language.";

export async function ensureAgent(userId: string): Promise<Agent> {
  const existing = await prisma.agent.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.agent.create({
    data: { userId, apiKey: newAgentKey(), systemPrompt: DEFAULT_PROMPT }
  });
}

export async function getAgentForUser(userId: string): Promise<Agent | null> {
  return prisma.agent.findUnique({ where: { userId } });
}

export function buildSystemPrompt(agent: Agent): string {
  const parts: string[] = [agent.systemPrompt?.trim() || DEFAULT_PROMPT];

  const skills = Array.isArray(agent.skills) ? (agent.skills as unknown[]) : [];
  if (skills.length) {
    parts.push("Skills you may use: " + skills.map((s) => String(s)).join(", ") + ".");
  }

  const kb = Array.isArray(agent.knowledgeBase) ? (agent.knowledgeBase as { title?: string; content?: string }[]) : [];
  if (kb.length) {
    parts.push(
      "Knowledge base:\n" +
        kb.map((k) => `- ${k.title ?? "Note"}: ${k.content ?? ""}`).join("\n")
    );
  }

  return parts.join("\n\n");
}
