import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { sanitizeName } from "@/lib/drive";
import { withZohoToken, workDriveBaseForAccount } from "@/lib/zohoAccount";
import { getMyFolderId, createNativeFile } from "@/lib/zohoWorkDrive";

const Body = z.object({
  kind: z.enum(["SHEET", "DOC", "SLIDES"]),
  name: z.string().max(200).optional(),
  parentId: z.string().nullable().optional()
});

const SERVICE: Record<string, "zw" | "zohosheet" | "zohoshow"> = {
  DOC: "zw",
  SHEET: "zohosheet",
  SLIDES: "zohoshow"
};

// Create a native Zoho document / sheet / slides and link it in the drive.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const auth = await withZohoToken(userId);
  if (!auth) return NextResponse.json({ error: "Zoho is not connected." }, { status: 409 });

  const base = workDriveBaseForAccount(auth.account);
  const folderId = await getMyFolderId(base, auth.accessToken);
  if (!folderId) return NextResponse.json({ error: "Could not find your Zoho folder." }, { status: 502 });

  const defaultName = parsed.data.kind === "SHEET" ? "New sheet" : parsed.data.kind === "DOC" ? "New document" : "New slides";
  const created = await createNativeFile(base, auth.accessToken, {
    parentId: folderId,
    name: sanitizeName(parsed.data.name || defaultName),
    serviceType: SERVICE[parsed.data.kind]
  });
  if (!created) return NextResponse.json({ error: "Zoho refused to create the file." }, { status: 502 });

  const item = await prisma.driveItem.create({
    data: {
      ownerId: userId,
      parentId: parsed.data.parentId || null,
      kind: "LINK",
      name: created.name,
      mimeType: `application/zoho-${parsed.data.kind.toLowerCase()}`,
      sourceUrl: created.permalink ?? `https://workdrive.zoho.${auth.account.dc}/file/${created.id}`,
      content: ""
    }
  });

  return NextResponse.json({ item, zoho: created }, { status: 201 });
}
