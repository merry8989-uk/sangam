import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const target = new URL(req.url).searchParams.get("userId");
  if (!userId || !target) return NextResponse.json({ blocking: false });

  const found = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: target } },
    select: { id: true }
  });
  return NextResponse.json({ blocking: Boolean(found) });
}

const Body = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const target = parsed.data.userId;
  if (target === userId) return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });

  const existing = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: userId, blockedId: target } }
  });
  if (existing) {
    await prisma.block.delete({ where: { blockerId_blockedId: { blockerId: userId, blockedId: target } } });
    return NextResponse.json({ blocking: false });
  }
  await prisma.block.create({ data: { blockerId: userId, blockedId: target } });
  // Blocking also removes any follow relationship in either direction.
  await prisma.follow.deleteMany({
    where: { OR: [{ followerId: userId, followeeId: target }, { followerId: target, followeeId: userId }] }
  });
  return NextResponse.json({ blocking: true });
}
