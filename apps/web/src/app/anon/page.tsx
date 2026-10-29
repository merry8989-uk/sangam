import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AnonChat from "@/components/AnonChat";

export const dynamic = "force-dynamic";

/**
 * Anonymous chat.
 *
 * A signed-in account is required - not to know who you are, but so there is
 * someone to delete the chat for. Nothing in a chat shows a name.
 */
export default async function AnonPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-lg font-semibold text-ink-900">Anonymous chat</h1>
      <p className="mb-4 text-xs text-ink-500">
        Talk to anyone without either side knowing who the other is. Use your permanent key for a chat that stays, or a
        temporary key that deletes itself when its time runs out.
      </p>
      <AnonChat />
    </main>
  );
}
