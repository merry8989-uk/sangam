import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Resolve a join code to a room, so "enter code" works from anywhere.
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const room = await prisma.room.findUnique({
    where: { joinCode: params.code.toUpperCase() },
    select: {
      id: true,
      kind: true,
      name: true,
      status: true,
      visibility: true,
      isLive: true,
      owner: { select: { username: true, displayName: true } }
    }
  });
  if (!room) return NextResponse.json({ error: "No room with that code" }, { status: 404 });
  return NextResponse.json({ room });
}
