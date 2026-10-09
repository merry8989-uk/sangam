import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    include: {
      posts: { where: { status: "READY" }, orderBy: { createdAt: "desc" }, take: 24 },
      _count: { select: { followers: true, following: true, posts: true } }
    }
  });
  if (!user) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-brand-100" />
        <div>
          <h1 className="text-2xl font-semibold">{user.displayName}</h1>
          <p className="text-ink-500">@{user.username}</p>
          <p className="mt-1 text-sm text-ink-700">
            {user._count.posts} posts · {user._count.followers} followers · {user._count.following} following
          </p>
        </div>
      </header>
      {user.bio && <p className="mt-4">{user.bio}</p>}
      <div className="mt-6 grid grid-cols-3 gap-2">
        {user.posts.map((p) => (
          <div key={p.id} className="aspect-square rounded-lg bg-slate-200" />
        ))}
      </div>
    </main>
  );
}
