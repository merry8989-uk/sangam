import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ targetId: z.string(), action: z.enum(["follow", "unfollow"]) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { targetId, action } = parsed.data;
  if (targetId === userId) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  if (action === "follow") {
    await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
      update: { status: "ACCEPTED" },
      create: { followerId: userId, followeeId: targetId, status: "ACCEPTED" }
    });
  } else {
    await prisma.follow.deleteMany({ where: { followerId: userId, followeeId: targetId } });
  }
  return NextResponse.json({ ok: true });
}
