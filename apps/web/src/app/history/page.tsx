import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import ClearHistory from "@/components/ClearHistory";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const rows = await prisma.viewHistory.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: 60
  });
  const posts = rows.length
    ? await prisma.post.findMany({
        where: { id: { in: rows.map((r) => r.postId) } },
        include: { author: { select: { username: true } }, media: true }
      })
    : [];
  const byId = new Map(posts.map((p) => [p.id, p]));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Watch history</h1>
        {rows.length > 0 && <ClearHistory />}
      </div>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-ink-500">Nothing here yet.</li>}
        {rows.map((r) => {
          const p = byId.get(r.postId);
          if (!p) return null;
          const m = p.media[0];
          return (
            <li key={r.id}>
              <Link href={`/post/${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <span className="h-12 w-20 shrink-0 overflow-hidden rounded bg-slate-200">
                  {m?.thumbnailKey && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="h-full w-full object-cover" src={mediaUrl(m.thumbnailKey)} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.caption || "(no title)"}</span>
                  <span className="block text-xs text-ink-500">
                    @{p.author.username} · {new Date(r.viewedAt).toLocaleString("en-IN")}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
