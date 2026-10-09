import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { sanitizeName, canMoveTo } from "@/lib/drive";
import { loadItemWithAccess } from "@/lib/driveAccess";
import { canRead, canWrite, canManage } from "@/lib/drive-share";

// Read one item, including its content.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await loadItemWithAccess(userId, params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canRead(access.level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access.item.trashedAt && access.level !== "OWNER") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item: access.item, access: access.level, via: access.via });
}

const PatchBody = z.object({
  name: z.string().max(300).optional(),
  content: z.string().max(2_000_000).optional(),
  parentId: z.string().nullable().optional(),
  starred: z.boolean().optional()
});

// Rename, edit content, move or star an item.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const access = await loadItemWithAccess(userId, params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canWrite(access.level)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const item = access.item;
  // An editor may change the content; only the owner may rename, move or star.
  if (!canManage(access.level) && (parsed.data.name !== undefined || parsed.data.parentId !== undefined || parsed.data.starred !== undefined)) {
    return NextResponse.json({ error: "Only the owner can rename, move or star this" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = sanitizeName(parsed.data.name);
  if (parsed.data.content !== undefined) data.content = parsed.data.content;
  if (parsed.data.starred !== undefined) data.starred = parsed.data.starred;

  if (parsed.data.parentId !== undefined) {
    const target = parsed.data.parentId;
    if (target) {
      const parent = await prisma.driveItem.findFirst({ where: { id: target, ownerId: userId, kind: "FOLDER" } });
      if (!parent) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      // Walk up from the target so we never create a cycle.
      const ancestors: string[] = [];
      let cursor: string | null = target;
      for (let i = 0; i < 100 && cursor; i++) {
        ancestors.push(cursor);
        const row: { parentId: string | null } | null = await prisma.driveItem.findUnique({
          where: { id: cursor },
          select: { parentId: true }
        });
        cursor = row?.parentId ?? null;
      }
      if (!canMoveTo(item.id, target, ancestors)) {
        return NextResponse.json({ error: "Cannot move a folder into itself" }, { status: 400 });
      }
    }
    data.parentId = target;
  }

  const updated = await prisma.driveItem.update({ where: { id: item.id }, data });
  return NextResponse.json({ item: updated });
}

// Move to trash, or delete for good with ?hard=1.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await loadItemWithAccess(userId, params.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManage(access.level)) return NextResponse.json({ error: "Only the owner can delete this" }, { status: 403 });

  const item = access.item;
  const hard = new URL(req.url).searchParams.get("hard") === "1";
  if (hard) {
    await prisma.driveItem.delete({ where: { id: item.id } });
    return NextResponse.json({ ok: true, deleted: true });
  }
  await prisma.driveItem.update({ where: { id: item.id }, data: { trashedAt: new Date() } });
  return NextResponse.json({ ok: true, trashed: true });
}
