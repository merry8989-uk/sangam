import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Bump the denormalised share counter on a post. `undo` takes one back, and
// never lets the counter go below zero.
const Body = z.object({ postId: z.string(), undo: z.boolean().optional() });

export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId, undo } = parsed.data;

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { shareCount: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = Math.max(0, post.shareCount + (undo ? -1 : 1));
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { shareCount: next },
    select: { shareCount: true }
  });

  return NextResponse.json({ shareCount: updated.shareCount });
}
