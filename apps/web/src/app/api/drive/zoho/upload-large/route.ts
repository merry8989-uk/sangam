import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { sanitizeName, MAX_UPLOAD_BYTES } from "@/lib/drive";
import { withZohoToken, workDriveBaseForAccount } from "@/lib/zohoAccount";
import { getMyFolderId, streamUpload } from "@/lib/zohoWorkDrive";
import { uploadBaseFor } from "@/lib/zoho";

// Large-file upload. The body is piped straight to WorkDrive, so nothing is
// held in memory here. The client sends the filename and folder as headers.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await withZohoToken(userId);
  if (!auth) return NextResponse.json({ error: "Zoho is not connected." }, { status: 409 });

  const rawName = req.headers.get("x-filename");
  const parentId = req.headers.get("x-parent-id") || null;
  if (!rawName) return NextResponse.json({ error: "Missing x-filename" }, { status: 400 });

  const filename = sanitizeName(decodeURIComponent(rawName));
  const declaredSize = Number(req.headers.get("x-size") || 0);
  if (declaredSize > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is larger than 512 MB." }, { status: 413 });
  }
  if (!req.body) return NextResponse.json({ error: "No file was sent." }, { status: 400 });

  const base = workDriveBaseForAccount(auth.account);
  const folderId = await getMyFolderId(base, auth.accessToken);
  if (!folderId) return NextResponse.json({ error: "Could not find your Zoho folder." }, { status: 502 });

  const uploaded = await streamUpload(uploadBaseFor(auth.account.dc as never), auth.accessToken, {
    parentId: folderId,
    filename,
    body: req.body,
    overrideExisting: true
  });
  if (!uploaded) return NextResponse.json({ error: "Zoho refused the upload." }, { status: 502 });

  const item = await prisma.driveItem.create({
    data: {
      ownerId: userId,
      parentId,
      kind: "LINK",
      name: uploaded.name,
      mimeType: req.headers.get("x-content-type") || "",
      sizeBytes: declaredSize,
      sourceUrl: uploaded.permalink ?? `https://workdrive.zoho.${auth.account.dc}/file/${uploaded.id}`,
      content: ""
    }
  });

  return NextResponse.json({ item, zoho: uploaded }, { status: 201 });
}
