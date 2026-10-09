import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { DRIVE_KINDS, EDITABLE_KINDS, defaultContentFor, sanitizeName, withinQuota } from "@/lib/drive";

// List a folder (or search, or the trash).
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const trash = url.searchParams.get("trash") === "1";
  const parentId = url.searchParams.get("parentId");

  if (q) {
    const items = await prisma.driveItem.findMany({
      where: { ownerId: userId, trashedAt: null, name: { contains: q, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return NextResponse.json({ items, parent: null });
  }

  const where = trash
    ? { ownerId: userId, trashedAt: { not: null } }
    : { ownerId: userId, trashedAt: null, parentId: parentId || null };

  const [items, parent] = await Promise.all([
    prisma.driveItem.findMany({
      where,
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
      take: 300
    }),
    parentId
      ? prisma.driveItem.findFirst({ where: { id: parentId, ownerId: userId }, select: { id: true, name: true, parentId: true } })
      : Promise.resolve(null)
  ]);

  return NextResponse.json({ items, parent });
}

const CreateBody = z.object({
  kind: z.enum(DRIVE_KINDS),
  name: z.string().max(300).optional(),
  parentId: z.string().optional().nullable(),
  // For kind = FILE, the key returned by /api/drive/upload.
  storageKey: z.string().max(500).optional(),
  mimeType: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(0).max(5 * 1024 * 1024 * 1024).optional()
});

// Create a folder, a document, or register an uploaded file.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { kind, parentId, storageKey, mimeType, sizeBytes } = parsed.data;

  if (parentId) {
    const parent = await prisma.driveItem.findFirst({ where: { id: parentId, ownerId: userId, kind: "FOLDER" } });
    if (!parent) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (kind === "FILE") {
    if (!storageKey || !storageKey.startsWith(`drive/${userId}/`)) {
      return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
    }
    const used = await prisma.driveItem.aggregate({ where: { ownerId: userId }, _sum: { sizeBytes: true } });
    if (!withinQuota(used._sum.sizeBytes ?? 0, sizeBytes ?? 0)) {
      return NextResponse.json({ error: "Not enough space left" }, { status: 413 });
    }
  }

  const defaultName =
    kind === "FOLDER" ? "New folder" : kind === "SHEET" ? "New sheet" : kind === "DOC" ? "New document" : kind === "SLIDES" ? "New slides" : "New note";

  const item = await prisma.driveItem.create({
    data: {
      ownerId: userId,
      parentId: parentId || null,
      kind,
      name: sanitizeName(parsed.data.name || defaultName),
      mimeType: mimeType ?? "",
      sizeBytes: sizeBytes ?? 0,
      storageKey: storageKey ?? null,
      content: (EDITABLE_KINDS as readonly string[]).includes(kind) ? defaultContentFor(kind) : ""
    }
  });

  return NextResponse.json({ item }, { status: 201 });
}
