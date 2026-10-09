import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AgentAssist from "@/components/AgentAssist";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      posts: { where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { followers: true, following: true, posts: true } }
    }
  });
  if (!user) redirect("/login");

  const totals = user.posts.reduce(
    (acc, p) => ({
      likes: acc.likes + p.likeCount,
      comments: acc.comments + p.commentCount,
      views: acc.views + p.viewCount
    }),
    { likes: 0, comments: 0, views: 0 }
  );

  const stats = [
    { label: "Posts", value: user._count.posts },
    { label: "Followers", value: user._count.followers },
    { label: "Likes", value: totals.likes },
    { label: "Comments", value: totals.comments },
    { label: "Views", value: totals.views }
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Creator studio</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-bold text-brand-700">{s.value}</div>
            <div className="text-xs text-ink-500">{s.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Recent posts</h2>
      <ul className="mb-8 space-y-2">
        {user.posts.length === 0 && <li className="text-ink-500">No posts yet.</li>}
        {user.posts.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
            <span className="truncate">{p.caption || "(no caption)"}</span>
            <span className="ml-4 shrink-0 text-ink-500">
              {p.likeCount} likes · {p.commentCount} comments · {p.viewCount} views
            </span>
          </li>
        ))}
      </ul>

      <AgentAssist />
    </main>
  );
}
