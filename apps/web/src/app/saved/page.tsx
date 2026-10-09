import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PostCard from "@/components/PostCard";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const saved = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { post: { include: { author: true, media: true } } }
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Saved</h1>
      <ul className="space-y-4">
        {saved.length === 0 && <li className="text-ink-500">Nothing saved yet.</li>}
        {saved.map((b) => (
          <li key={b.id}>
            <PostCard post={b.post} />
          </li>
        ))}
      </ul>
    </main>
  );
}
