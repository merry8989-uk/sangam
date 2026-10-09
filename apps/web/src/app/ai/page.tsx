import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAgentForUser } from "@/lib/agent";
import ChatPanel from "@/components/ChatPanel";

export const dynamic = "force-dynamic";

// Chat works without login. Signed-in users get their own agent and saved history.
export default async function AiPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const agent = userId ? await getAgentForUser(userId) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Sangam AI</h1>
      <p className="mb-6 text-sm text-ink-500">
        Powered by Sarvam&apos;s 105B model (the model behind Indus). No sign-in required.
      </p>
      <ChatPanel loggedIn={Boolean(userId)} agentName={agent?.name} />
      <div id="recent" className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Recent chat</h2>
        <p className="text-sm text-ink-500">
          {userId
            ? "Your conversations are saved. Open the AI button to jump back in."
            : "Sign in to save and revisit conversations. Right now they live in this browser."}
        </p>
      </div>
    </main>
  );
}
