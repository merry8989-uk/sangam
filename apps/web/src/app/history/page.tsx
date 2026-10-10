import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import HistoryManager from "@/components/HistoryManager";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">History</h1>
      <p className="mb-6 text-sm text-ink-500">
        What you watched and searched for, stored so it is still here after a restart. You decide
        whether it is kept, archived, deleted after a period, or never recorded at all.
      </p>
      <HistoryManager />
    </main>
  );
}
