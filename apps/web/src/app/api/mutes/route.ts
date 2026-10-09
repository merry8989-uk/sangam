import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const target = new URL(req.url).searchParams.get("userId");
  if (!userId || !target) return NextResponse.json({ muting: false });

  const found = await prisma.mute.findUnique({
    where: { muterId_mutedId: { muterId: userId, mutedId: target } },
    select: { id: true }
  });
  return NextResponse.json({ muting: Boolean(found) });
}

const Body = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const target = parsed.data.userId;
  if (target === userId) return NextResponse.json({ error: "Cannot mute yourself" }, { status: 400 });

  const existing = await prisma.mute.findUnique({
    where: { muterId_mutedId: { muterId: userId, mutedId: target } }
  });
  if (existing) {
    await prisma.mute.delete({ where: { muterId_mutedId: { muterId: userId, mutedId: target } } });
    return NextResponse.json({ muting: false });
  }
  await prisma.mute.create({ data: { muterId: userId, mutedId: target } });
  return NextResponse.json({ muting: true });
}
