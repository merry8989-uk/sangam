import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOperator } from "@/lib/admin";
import LogsView from "@/components/LogsView";

export const dynamic = "force-dynamic";

/**
 * The log view. Operators only.
 *
 * The check is here as well as in the API: a page that renders and then fails
 * every request is a worse experience than being turned away, and the guard
 * should not depend on the client behaving.
 */
export default async function LogsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  if (!(await isOperator(userId))) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-lg font-semibold text-ink-900">Logs</h1>
        <p className="mt-2 text-sm text-ink-500">
          Reading the logs is an operator privilege. Ask an administrator if you need access.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <LogsView />
    </main>
  );
}
