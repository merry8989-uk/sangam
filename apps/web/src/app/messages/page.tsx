import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    orderBy: { conversation: { updatedAt: "desc" } },
    include: {
      conversation: {
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } }
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }
    }
  });

  const items = await Promise.all(
    parts.map(async (p) => {
      const other = p.conversation.participants.find((q) => q.userId !== userId)?.user ?? null;
      const last = p.conversation.messages[0] ?? null;
      const unread = await prisma.directMessage.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {})
        }
      });
      return { id: p.conversationId, other, lastBody: last?.body ?? null, unread };
    })
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Messages</h1>
      <ul className="space-y-1">
        {items.length === 0 && <li className="text-ink-500">No conversations yet.</li>}
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
              <Avatar src={c.other?.avatarUrl} name={c.other?.displayName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">@{c.other?.username ?? "unknown"}</div>
                <div className="truncate text-xs text-ink-500">{c.lastBody ?? "No messages yet"}</div>
              </div>
              {c.unread > 0 && (
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  {c.unread}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
