import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Avatar from "@/components/Avatar";
import MarkAllRead from "@/components/MarkAllRead";

export const dynamic = "force-dynamic";

type Payload = { actorId?: string; actorUsername?: string; postId?: string; conversationId?: string; preview?: string };

function describe(type: string, p: Payload): string {
  if (type === "like") return "liked your post";
  if (type === "comment") return p.preview ? `commented: ${p.preview}` : "commented on your post";
  if (type === "follow") return "started following you";
  if (type === "message") return p.preview ? `messaged you: ${p.preview}` : "sent you a message";
  return "interacted with you";
}

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alerts</h1>
        {unread > 0 && <MarkAllRead />}
      </div>

      <ul className="space-y-1">
        {items.length === 0 && <li className="text-ink-500">No alerts yet.</li>}
        {items.map((n) => {
          const p = (n.payload ?? {}) as Payload;
          const body = (
            <span>
              <span className="font-medium">@{p.actorUsername ?? "someone"}</span>{" "}
              <span className="text-ink-700">{describe(n.type, p)}</span>
            </span>
          );
          return (
            <li key={n.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${n.readAt ? "" : "bg-brand-50"}`}>
              <Avatar name={p.actorUsername ?? "?"} size={36} />
              {p.postId ? (
                <Link href={`/post/${p.postId}`} className="hover:underline">
                  {body}
                </Link>
              ) : p.conversationId ? (
                <Link href={`/messages/${p.conversationId}`} className="hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
              <time className="ml-auto shrink-0 text-xs text-ink-500">
                {new Date(n.createdAt).toLocaleString("en-IN")}
              </time>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
