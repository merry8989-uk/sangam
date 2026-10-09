import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { sanitizeName, MAX_UPLOAD_BYTES } from "@/lib/drive";
import { withZohoToken, workDriveBaseForAccount } from "@/lib/zohoAccount";
import { getMyFolderId, uploadFile } from "@/lib/zohoWorkDrive";

// Upload a file straight into the user's Zoho WorkDrive. Unlike the S3 path
// this has to go through our server, because WorkDrive uploads are
// authenticated with the user's OAuth token.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await withZohoToken(userId);
  if (!auth) return NextResponse.json({ error: "Zoho is not connected." }, { status: 409 });

  const form = await req.formData();
  const file = form.get("file");
  const parentId = (form.get("parentId") as string) || null;

  if (!(file instanceof File)) return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "WorkDrive takes files up to 250 MB through this endpoint." }, { status: 413 });
  }

  const base = workDriveBaseForAccount(auth.account);
  const folderId = await getMyFolderId(base, auth.accessToken);
  if (!folderId) return NextResponse.json({ error: "Could not find your Zoho folder." }, { status: 502 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploaded = await uploadFile(base, auth.accessToken, {
    parentId: folderId,
    filename: sanitizeName(file.name),
    bytes,
    contentType: file.type || "application/octet-stream"
  });
  if (!uploaded) return NextResponse.json({ error: "Zoho refused the upload." }, { status: 502 });

  const item = await prisma.driveItem.create({
    data: {
      ownerId: userId,
      parentId,
      kind: "LINK",
      name: uploaded.name,
      mimeType: file.type || "",
      sizeBytes: file.size,
      sourceUrl: uploaded.permalink ?? `https://workdrive.zoho.${auth.account.dc}/file/${uploaded.id}`,
      content: ""
    }
  });

  return NextResponse.json({ item, zoho: uploaded }, { status: 201 });
}
