import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

const Body = z.object({ postId: z.string().min(1) });

// Toggle a like for the current user and return the authoritative state.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId } = parsed.data;

  const existing = await prisma.like.findUnique({
    where: { postId_userId: { postId, userId } }
  });

  let liked: boolean;
  if (existing) {
    await prisma.like.delete({ where: { postId_userId: { postId, userId } } });
    await prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
    liked = false;
  } else {
    await prisma.like.create({ data: { postId, userId } });
    await prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
    liked = true;

    const [post, actor] = await Promise.all([
      prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    ]);
    if (post && actor) {
      await notify(post.authorId, "like", { actorId: userId, actorUsername: actor.username, postId });
    }
  }

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
  return NextResponse.json({ liked, likeCount: post?.likeCount ?? 0 });
}
