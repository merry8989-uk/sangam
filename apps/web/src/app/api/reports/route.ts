import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  entityType: z.enum(["post", "user", "comment", "message"]),
  entityId: z.string().min(1),
  reason: z.string().min(1).max(200),
  note: z.string().max(1000).optional()
});

// Reports land in the moderation queue (/moderation).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const report = await prisma.report.create({
    data: { reporterId: userId, ...parsed.data }
  });
  return NextResponse.json({ id: report.id }, { status: 201 });
}
