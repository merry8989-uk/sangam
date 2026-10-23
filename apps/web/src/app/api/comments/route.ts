import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { canActOnPost } from "@/lib/audience";
import { withLogging } from "@/lib/withLogging";

const Body = z.object({
  postId: z.string().min(1),
  body: z.string().min(1).max(1000),
  parentId: z.string().optional()
});

export const GET = withLogging("comments:get", async (req: Request) => {
  const postId = new URL(req.url).searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });

  const comments = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { author: { select: { username: true, displayName: true } } }
  });
  return NextResponse.json({ items: comments });
});

export const POST = withLogging("comments:post", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId, body, parentId } = parsed.data;

  // whoCanComment was stored and never read, so a user could set "nobody may
  // comment", see it saved, and still get comments.
  const audience = await canActOnPost(userId, postId, "whoCanComment");
  if (!audience.postExists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!audience.allowed) {
    return NextResponse.json({ error: "Commenting is not allowed on this post." }, { status: 403 });
  }

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
});
