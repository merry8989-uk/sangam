import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";

// Delete a skip point. Only its author may remove it.
export const DELETE = withLogging("skip-points:id:delete", async (req: Request, { params }: { params: { id: string } }) => {
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
});
