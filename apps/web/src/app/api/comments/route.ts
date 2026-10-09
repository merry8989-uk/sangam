import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";

const Body = z.object({
  postId: z.string().min(1),
  body: z.string().min(1).max(1000),
  parentId: z.string().optional()
});

export async function GET(req: Request) {
  const postId = new URL(req.url).searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });

  const comments = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { author: { select: { username: true, displayName: true } } }
  });
  return NextResponse.json({ items: comments });
}

export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId, body, parentId } = parsed.data;

  const comment = await prisma.comment.create({
    data: { postId, authorId: userId, body, parentId: parentId ?? null },
    include: { author: { select: { username: true, displayName: true } } }
  });
  await prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (post) {
    await notify(post.authorId, "comment", {
      actorId: userId,
      actorUsername: comment.author.username,
      postId,
      preview: body.slice(0, 80)
    });
  }

  return NextResponse.json(comment, { status: 201 });
}
