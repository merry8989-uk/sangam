import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PostCard from "@/components/PostCard";
import Comments from "@/components/Comments";
import DeletePostButton from "@/components/DeletePostButton";
import { getSettingsOptional } from "@/lib/settings";
import ReportButton from "@/components/ReportButton";
import { loadDisplay, primaryStatesFor } from "@/lib/postDisplayServer";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: { author: true, media: true }
  });
  if (!post || post.status === "REMOVED") notFound();

  const settings = await getSettingsOptional(userId);

  const liked = userId
    ? Boolean(await prisma.like.findUnique({ where: { postId_userId: { postId: post.id, userId } } }))
    : false;

  const display = await loadDisplay(userId);
  const primaryStates = await primaryStatesFor(userId, [post.authorId]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {userId === post.authorId && (
        <div className="mb-3 flex justify-end">
          <DeletePostButton postId={post.id} />
        </div>
      )}
      <PostCard
        post={post}
        liked={liked}
        display={display}
        primaryState={primaryStates.get(post.authorId) ?? "NONE"}
        isOwn={post.authorId === userId}
      />
      <div className="mt-3 flex justify-end">
        <ReportButton entityType="post" entityId={post.id} />
      </div>
      <Comments postId={post.id} threaded={settings?.threadedComments ?? true} sort={settings?.commentSort ?? "top"} />
    </main>
  );
}
