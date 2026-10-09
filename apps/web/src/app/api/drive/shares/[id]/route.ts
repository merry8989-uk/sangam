import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";

// Revoke a share. Only the person who made it can.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const share = await prisma.driveShare.findUnique({ where: { id: params.id } });
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (share.ownerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.driveShare.delete({ where: { id: share.id } });
  return NextResponse.json({ ok: true });
}
