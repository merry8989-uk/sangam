import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePost } from "@/lib/search";

// Read one post as JSON (used by the mobile app).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: { author: { select: { username: true, displayName: true } }, media: true }
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.visibility === "PRIVATE") {
    const viewerId = await getViewerId(req);
    if (viewerId !== post.authorId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ post });
}

// Delete a post. Only the author may delete it. Media, likes, comments and
// hashtag links cascade with the row.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id: params.id }, select: { authorId: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.post.delete({ where: { id: params.id } });
  await removePost(params.id);
  return NextResponse.json({ ok: true });
}
