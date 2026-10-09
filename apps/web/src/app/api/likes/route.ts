import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ postId: z.string().min(1) });

// Toggle a like for the current user and return the authoritative state.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
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
  }

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
  return NextResponse.json({ liked, likeCount: post?.likeCount ?? 0 });
}
