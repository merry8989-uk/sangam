import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";

// Disconnect a linked account, and forget its stored credential.
export const DELETE = withLogging("linked-accounts:id:delete", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.linkedAccount.findFirst({ where: { id: params.id, userId } });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.linkedAccount.delete({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
});
