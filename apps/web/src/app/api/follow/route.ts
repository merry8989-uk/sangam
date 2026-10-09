import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { isBlockedEitherWay } from "@/lib/filters";

const Body = z.object({ targetId: z.string(), action: z.enum(["follow", "unfollow"]) });

export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { targetId, action } = parsed.data;
  if (targetId === userId) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  if (await isBlockedEitherWay(userId, targetId)) {
    return NextResponse.json({ error: "Cannot follow this user" }, { status: 403 });
  }

  if (action === "follow") {
    await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
      update: { status: "ACCEPTED" },
      create: { followerId: userId, followeeId: targetId, status: "ACCEPTED" }
    });
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (actor) {
      await notify(targetId, "follow", { actorId: userId, actorUsername: actor.username });
    }
  } else {
    await prisma.follow.deleteMany({ where: { followerId: userId, followeeId: targetId } });
  }
  return NextResponse.json({ ok: true });
}
