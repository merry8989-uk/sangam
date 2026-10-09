import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { sanitizeName } from "@/lib/drive";
import { normalizeShareLink, extractShareCode, isTeraboxUrl } from "@/lib/terabox";

const Body = z.object({
  url: z.string().min(4).max(2000),
  name: z.string().max(300).optional(),
  parentId: z.string().nullable().optional()
});

// Save an external link (a Terabox share link) into the drive. The bytes stay
// on Terabox - we store a pointer, because there is no supported way to pull
// them across without their official API.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const normalized = normalizeShareLink(parsed.data.url);
  if (!normalized) {
    return NextResponse.json({ error: "That is not a Terabox link." }, { status: 400 });
  }

  if (parsed.data.parentId) {
    const parent = await prisma.driveItem.findFirst({ where: { id: parsed.data.parentId, ownerId: userId, kind: "FOLDER" } });
    if (!parent) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const code = extractShareCode(normalized);
  const name = sanitizeName(parsed.data.name || (code ? `Terabox ${code}` : "Terabox link"));

  const item = await prisma.driveItem.create({
    data: {
      ownerId: userId,
      parentId: parsed.data.parentId || null,
      kind: "LINK",
      name,
      mimeType: "text/uri-list",
      sourceUrl: normalized,
      content: ""
    }
  });

  await prisma.linkedAccount.updateMany({
    where: { userId, provider: "TERABOX" },
    data: { lastUsedAt: new Date() }
  });

  return NextResponse.json({ item, isTerabox: isTeraboxUrl(normalized) }, { status: 201 });
}
