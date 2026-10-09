import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PostCard from "@/components/PostCard";
import Comments from "@/components/Comments";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: { author: true, media: true }
  });
  if (!post || post.status === "REMOVED") notFound();

  const liked = userId
    ? Boolean(await prisma.like.findUnique({ where: { postId_userId: { postId: post.id, userId } } }))
    : false;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <PostCard post={post} liked={liked} />
      <Comments postId={post.id} />
    </main>
  );
}
