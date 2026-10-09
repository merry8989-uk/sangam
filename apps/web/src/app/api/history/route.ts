import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Recently viewed posts for the signed-in user.
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ items: [] });

  const items = await prisma.viewHistory.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: 60
  });
  if (!items.length) return NextResponse.json({ items: [] });

  const posts = await prisma.post.findMany({
    where: { id: { in: items.map((i) => i.postId) } },
    include: { author: { select: { username: true } }, media: true }
  });
  const byId = new Map(posts.map((p) => [p.id, p]));
  return NextResponse.json({
    items: items.map((i) => ({ viewedAt: i.viewedAt, post: byId.get(i.postId) ?? null })).filter((i) => i.post)
  });
}

// Clear the whole history.
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.viewHistory.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
