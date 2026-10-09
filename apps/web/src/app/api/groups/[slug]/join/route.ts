import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Toggle membership. The owner cannot leave their own group.
export async function POST(_req: Request, { params }: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const group = await prisma.group.findUnique({ where: { slug: params.slug }, select: { id: true, ownerId: true } });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: group.id, userId } }
  });
  if (existing) {
    if (group.ownerId === userId) {
      return NextResponse.json({ error: "Owner cannot leave" }, { status: 400 });
    }
    await prisma.groupMember.delete({ where: { groupId_userId: { groupId: group.id, userId } } });
    return NextResponse.json({ joined: false });
  }
  await prisma.groupMember.create({ data: { groupId: group.id, userId } });
  return NextResponse.json({ joined: true });
}
