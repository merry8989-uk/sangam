import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// GET /api/bookmarks?postId=X - is this post saved by me?
// GET /api/bookmarks             - my saved posts, newest first.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ saved: false, items: [] });

  const postId = new URL(req.url).searchParams.get("postId");
  if (postId) {
    const found = await prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
      select: { id: true }
    });
    return NextResponse.json({ saved: Boolean(found) });
  }

  const items = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { post: { include: { author: true, media: true } } }
  });
  return NextResponse.json({ items: items.map((b) => b.post) });
}

const Body = z.object({ postId: z.string().min(1) });

// POST /api/bookmarks - toggle a save.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId } = parsed.data;

  const existing = await prisma.bookmark.findUnique({ where: { userId_postId: { userId, postId } } });
  if (existing) {
    await prisma.bookmark.delete({ where: { userId_postId: { userId, postId } } });
    return NextResponse.json({ saved: false });
  }
  await prisma.bookmark.create({ data: { userId, postId } });
  return NextResponse.json({ saved: true });
}
