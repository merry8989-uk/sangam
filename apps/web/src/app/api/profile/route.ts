import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { indexUsers } from "@/lib/search";

const Body = z.object({
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().max(500).optional(),
  coverUrl: z.string().max(500).optional()
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, displayName: true, bio: true, avatarUrl: true, coverUrl: true }
  });
  await indexUsers([{ id: userId, username: user.username, displayName: user.displayName }]);
  return NextResponse.json({ user });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: userId },
    data: parsed.data,
    select: { username: true, displayName: true, bio: true, avatarUrl: true, coverUrl: true }
  });
  await indexUsers([{ id: userId, username: user.username, displayName: user.displayName }]);
  return NextResponse.json({ user });
}
