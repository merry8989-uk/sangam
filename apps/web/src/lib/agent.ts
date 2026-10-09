import { randomBytes } from "crypto";
import type { Agent } from "@prisma/client";
import { prisma } from "./prisma";
import { cosine, embedTexts } from "./embeddings";

// One agent per user. The unique index on Agent.userId is the guarantee.

export function newAgentKey(): string {
  return "sangam_" + randomBytes(24).toString("hex");
}

const DEFAULT_PROMPT =
  "You are the assistant for Sangam, an India-first social and video platform. " +
  "Be concise and helpful. Reply in the user's language.";

type KBEntry = { title?: string; content?: string; embedding?: number[] };

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

function kbOf(agent: Agent): KBEntry[] {
  return Array.isArray(agent.knowledgeBase) ? (agent.knowledgeBase as KBEntry[]) : [];
}

// Retrieve the knowledge-base entries most relevant to a query by embedding
// similarity. Falls back to the first entries when nothing is embedded or the
// embeddings service is unavailable.
export async function retrieveKnowledge(agent: Agent, query: string, k = 4): Promise<KBEntry[]> {
  const kb = kbOf(agent);
  if (!kb.length) return [];
  const anyEmbedded = kb.some((e) => Array.isArray(e.embedding) && e.embedding.length > 0);
  if (!anyEmbedded) return kb.slice(0, k);

  try {
    const { embeddings } = await embedTexts([query]);
    const q = embeddings[0] ?? [];
    return [...kb]
      .map((e) => ({ e, s: Array.isArray(e.embedding) ? cosine(q, e.embedding) : 0 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((x) => x.e);
  } catch {
    return kb.slice(0, k);
  }
}

// Compute and store embeddings for every knowledge-base entry. Called when the
// agent is saved, so retrieval only needs to embed the query at chat time.
export async function embedKnowledgeBase(agent: Agent): Promise<number> {
  const kb = kbOf(agent);
  if (!kb.length) return 0;
  const { embeddings, engine } = await embedTexts(
    kb.map((e) => `${e.title ?? ""}. ${e.content ?? ""}`)
  );
  const enriched = kb.map((e, i) => ({ ...e, embedding: embeddings[i] ?? [], embeddingEngine: engine }));
  await prisma.agent.update({ where: { id: agent.id }, data: { knowledgeBase: enriched } });
  return enriched.length;
}

export async function buildSystemPrompt(agent: Agent, query?: string): Promise<string> {
  const parts: string[] = [agent.systemPrompt?.trim() || DEFAULT_PROMPT];

  const skills = Array.isArray(agent.skills) ? (agent.skills as unknown[]) : [];
  if (skills.length) {
    parts.push("Skills you may use: " + skills.map((s) => String(s)).join(", ") + ".");
  }

  const kb = kbOf(agent);
  if (kb.length) {
    const chosen = query ? await retrieveKnowledge(agent, query, 4) : kb.slice(0, 4);
    if (chosen.length) {
      parts.push(
        "Relevant knowledge:\n" +
          chosen.map((k) => `- ${k.title ?? "Note"}: ${k.content ?? ""}`).join("\n")
      );
    }
  }

  return parts.join("\n\n");
}
