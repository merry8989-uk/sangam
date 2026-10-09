import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";

const Body = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

// Vote on a community skip point. One vote per user; changing a vote adjusts
// the counters by the difference, so scores cannot be inflated by repeats.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const value = parsed.data.value;

  const segment = await prisma.skipSegment.findUnique({
    where: { id: params.id },
    select: { id: true }
  });
  if (!segment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.skipVote.findUnique({
    where: { segmentId_userId: { segmentId: params.id, userId } }
  });

  if (existing && existing.value === value) {
    // Toggle the vote off.
    await prisma.skipVote.delete({ where: { id: existing.id } });
    await prisma.skipSegment.update({
      where: { id: params.id },
      data: value === 1 ? { upvotes: { decrement: 1 } } : { downvotes: { decrement: 1 } }
    });
    return NextResponse.json({ ok: true, vote: 0 });
  }

  const delta = existing
    ? value === 1
      ? { upvotes: { increment: 1 }, downvotes: { decrement: 1 } }
      : { upvotes: { decrement: 1 }, downvotes: { increment: 1 } }
    : value === 1
      ? { upvotes: { increment: 1 } }
      : { downvotes: { increment: 1 } };

  await prisma.skipVote.upsert({
    where: { segmentId_userId: { segmentId: params.id, userId } },
    create: { segmentId: params.id, userId, value },
    update: { value }
  });
  await prisma.skipSegment.update({ where: { id: params.id }, data: delta });

  return NextResponse.json({ ok: true, vote: value });
}
