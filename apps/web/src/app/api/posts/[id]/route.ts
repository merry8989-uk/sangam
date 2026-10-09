import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removePost } from "@/lib/search";

// Delete a post. Only the author may delete it. Media, likes, comments and
// hashtag links cascade with the row.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id: params.id }, select: { authorId: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.post.delete({ where: { id: params.id } });
  await removePost(params.id);
  return NextResponse.json({ ok: true });
}
