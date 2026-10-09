import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CreateGroupForm from "@/components/CreateGroupForm";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const mine = userId
    ? await prisma.group.findMany({
        where: { members: { some: { userId } } },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { members: true, posts: true } } }
      })
    : [];

  const discover = await prisma.group.findMany({
    where: {
      visibility: "PUBLIC",
      ...(userId ? { NOT: { members: { some: { userId } } } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { _count: { select: { members: true, posts: true } } }
  });

  const Card = ({ g }: { g: { slug: string; name: string; description: string | null; _count: { members: number; posts: number } } }) => (
    <Link href={`/groups/${g.slug}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
      <div className="font-medium">{g.name}</div>
      <div className="line-clamp-2 text-sm text-ink-500">{g.description || "No description"}</div>
      <div className="mt-1 text-xs text-ink-500">{g._count.members} members · {g._count.posts} posts</div>
    </Link>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Groups</h1>
      {userId && <div className="mb-6"><CreateGroupForm /></div>}

      {mine.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-ink-500">Your groups</h2>
          <div className="grid gap-3 sm:grid-cols-2">{mine.map((g) => <Card key={g.id} g={g} />)}</div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-500">Discover</h2>
        {discover.length === 0 && <p className="text-ink-500">No public groups yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2">{discover.map((g) => <Card key={g.id} g={g} />)}</div>
      </section>
    </main>
  );
}
