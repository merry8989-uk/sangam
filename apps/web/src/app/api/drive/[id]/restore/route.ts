import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";

// Bring an item back out of the trash.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.driveItem.findFirst({ where: { id: params.id, ownerId: userId } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.driveItem.update({ where: { id: item.id }, data: { trashedAt: null } });
  return NextResponse.json({ item: updated });
}
