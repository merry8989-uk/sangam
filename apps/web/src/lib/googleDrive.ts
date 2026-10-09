import { randomBytes } from "crypto";
import { GOOGLE_UPLOAD_URL, buildMultipartBody } from "./google";

export type DriveFile = { id: string; name: string; webViewLink?: string };

// Upload a file in one request. Fine for a backup document; Drive's resumable
// API is what you would use for large binaries.
export async function uploadFile(
  accessToken: string,
  opts: { name: string; content: string; folderId?: string; contentType?: string }
): Promise<DriveFile | null> {
  const boundary = "sangam" + randomBytes(12).toString("hex");
  const metadata: Record<string, unknown> = { name: opts.name };
  if (opts.folderId) metadata.parents = [opts.folderId];

  const body = buildMultipartBody({
    boundary,
    metadata,
    content: opts.content,
    contentType: opts.contentType ?? "application/json"
  });

  const res = await fetch(`${GOOGLE_UPLOAD_URL}?uploadType=multipart&fields=id,name,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: string; name?: string; webViewLink?: string };
  if (!data.id) return null;
  return { id: data.id, name: data.name ?? opts.name, webViewLink: data.webViewLink };
}

// Create a folder to keep the backups together.
export async function ensureFolder(accessToken: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.ok) {
    const data = (await res.json()) as { files?: { id: string }[] };
    if (data.files?.length) return data.files[0].id;
  }

  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" })
  });
  if (!create.ok) return null;
  const made = (await create.json()) as { id?: string };
  return made.id ?? null;
}
