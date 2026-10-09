import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/notifications          - recent notifications + unread count
// GET /api/notifications?count=1  - unread count only (for the nav bell)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ items: [], unread: 0 });

  const unread = await prisma.notification.count({ where: { userId, readAt: null } });

  if (new URL(req.url).searchParams.get("count")) {
    return NextResponse.json({ unread });
  }

  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  return NextResponse.json({ items, unread });
}
