import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PostCard from "@/components/PostCard";
import Composer from "@/components/Composer";
import JoinGroupButton from "@/components/JoinGroupButton";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const group = await prisma.group.findUnique({
    where: { slug: params.slug },
    include: { owner: { select: { username: true } }, _count: { select: { members: true, posts: true } } }
  });
  if (!group) notFound();

  const isMember = userId
    ? Boolean(await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } }))
    : false;
  const canSee = group.visibility === "PUBLIC" || isMember;

  const posts = canSee
    ? await prisma.post.findMany({
        where: { groupId: group.id, status: "READY" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { author: true, media: true }
      })
    : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{group.name}</h1>
            <p className="text-sm text-ink-500">
              {group.visibility === "PRIVATE" ? "Private" : "Public"} group · {group._count.members} members ·{" "}
              {group._count.posts} posts · by @{group.owner.username}
            </p>
          </div>
          {userId && <JoinGroupButton slug={group.slug} initialJoined={isMember} />}
        </div>
        {group.description && <p className="mt-3 text-sm text-ink-700">{group.description}</p>}
      </header>

      {!canSee && (
        <p className="text-ink-500">This is a private group. Join to see its posts.</p>
      )}

      {canSee && isMember && (
        <div className="mb-6">
          <Composer groupId={group.id} />
        </div>
      )}

      {canSee && (
        <ul className="space-y-4">
          {posts.length === 0 && <li className="text-ink-500">No posts in this group yet.</li>}
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
