import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";

// Delete a skip point. Only its author may remove it.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const segment = await prisma.skipSegment.findUnique({
    where: { id: params.id },
    select: { authorId: true }
  });
  if (!segment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (segment.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.skipSegment.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
