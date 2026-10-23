import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canActOnPost } from "@/lib/audience";
import { withLogging } from "@/lib/withLogging";

// Bump the denormalised share counter on a post. `undo` takes one back, and
// never lets the counter go below zero.
const Body = z.object({
  postId: z.string(),
  undo: z.boolean().optional(),
  // A share that puts the post in front of new people is a reshare. The two
  // settings exist separately because they mean different things.
  reshare: z.boolean().optional()
});

export const POST = withLogging("shares:post", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId, undo, reshare } = parsed.data;

  // Both settings were stored and never read.
  const audience = await canActOnPost(userId, postId, reshare ? "whoCanReshare" : "whoCanShare");
  if (!audience.postExists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!audience.allowed) {
    return NextResponse.json({ error: "Sharing is not allowed on this post." }, { status: 403 });
  }

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { shareCount: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = Math.max(0, post.shareCount + (undo ? -1 : 1));
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { shareCount: next },
    select: { shareCount: true }
  });

  return NextResponse.json({ shareCount: updated.shareCount });
});
