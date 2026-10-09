import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ensureAgent } from "@/lib/agent";
import AgentConfig from "@/components/AgentConfig";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const agent = await ensureAgent(userId);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Your agent</h1>
      <p className="mb-6 text-sm text-ink-500">
        One agent per account. Configure it, then call it from your own apps with its API key.
      </p>
      <AgentConfig
        initial={{
          name: agent.name,
          model: agent.model,
          temperature: agent.temperature,
          systemPrompt: agent.systemPrompt,
          skills: (agent.skills as string[]) ?? [],
          knowledgeBase: (agent.knowledgeBase as { title: string; content: string }[]) ?? [],
          scheduledTasks: (agent.scheduledTasks as { cron: string; prompt: string }[]) ?? [],
          connectors: (agent.connectors as { name: string; type: string }[]) ?? [],
          apiKey: agent.apiKey
        }}
      />
    </main>
  );
}
