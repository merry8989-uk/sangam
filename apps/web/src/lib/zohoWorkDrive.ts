// Thin client over the Zoho WorkDrive REST API. No SDK: plain fetch calls.
// Docs: https://www.zoho.com/workdrive/developer/docs/api/v1/

export type WdFile = {
  id: string;
  name: string;
  type: string;
  permalink?: string;
  extn?: string;
};

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: "application/vnd.api+json" };
}

async function asJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// The user's own "My Folders" root. Everything we create goes under it.
export async function getMyFolderId(base: string, accessToken: string): Promise<string | null> {
  const res = await fetch(`${base}/users/me`, { headers: authHeaders(accessToken) });
  if (!res.ok) return null;
  const data = await asJson(res);
  const d = (data.data ?? {}) as { id?: string; attributes?: Record<string, unknown> };
  const attrs = (d.attributes ?? {}) as { myfolder_id?: string; id?: string };
  return attrs.myfolder_id ?? d.id ?? null;
}

// Create a native Zoho document, sheet or presentation.
// serviceType: "zw" (Writer) | "zohosheet" (Sheet) | "zohoshow" (Show)
export async function createNativeFile(
  base: string,
  accessToken: string,
  opts: { parentId: string; name: string; serviceType: "zw" | "zohosheet" | "zohoshow" }
): Promise<WdFile | null> {
  const res = await fetch(`${base}/files`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Type": "application/vnd.api+json" },
    body: JSON.stringify({
      data: {
        attributes: { service_type: opts.serviceType, parent_id: opts.parentId, name: opts.name },
        type: "files"
      }
    })
  });
  if (!res.ok) return null;
  const data = await asJson(res);
  const d = (data.data ?? {}) as { id?: string; attributes?: Record<string, unknown> };
  const attrs = (d.attributes ?? {}) as { name?: string; permalink?: string; extn?: string };
  if (!d.id) return null;
  return { id: d.id, name: attrs.name ?? opts.name, type: opts.serviceType, permalink: attrs.permalink, extn: attrs.extn };
}

// Upload a file up to 250 MB. Larger files need WorkDrive's stream API.
export async function uploadFile(
  base: string,
  accessToken: string,
  opts: { parentId: string; filename: string; bytes: Uint8Array; contentType: string }
): Promise<WdFile | null> {
  const form = new FormData();
  form.append("parent_id", opts.parentId);
  form.append("filename", opts.filename);
  form.append("override-name-exist", "true");
  form.append("content", new Blob([opts.bytes], { type: opts.contentType }), opts.filename);

  const res = await fetch(`${base}/upload`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    body: form
  });
  if (!res.ok) return null;
  const data = await asJson(res);
  const first = Array.isArray(data.data) ? (data.data[0] as { id?: string; attributes?: Record<string, unknown> }) : (data.data as { id?: string; attributes?: Record<string, unknown> });
  if (!first?.id) return null;
  const attrs = (first.attributes ?? {}) as { name?: string; extn?: string; permalink?: string };
  return { id: first.id, name: attrs.name ?? opts.filename, type: "file", permalink: attrs.permalink, extn: attrs.extn };
}

// Files directly inside a folder.
export async function listFiles(base: string, accessToken: string, folderId: string): Promise<WdFile[]> {
  const res = await fetch(`${base}/files/${folderId}/files?page%5Blimit%5D=50`, { headers: authHeaders(accessToken) });
  if (!res.ok) return [];
  const data = await asJson(res);
  const rows = Array.isArray(data.data) ? (data.data as { id?: string; attributes?: Record<string, unknown> }[]) : [];
  return rows
    .filter((r) => r.id)
    .map((r) => {
      const a = (r.attributes ?? {}) as { name?: string; extn?: string; permalink?: string };
      return { id: r.id as string, name: a.name ?? "Untitled", type: "file", permalink: a.permalink, extn: a.extn };
    });
}

export async function deleteFile(base: string, accessToken: string, fileId: string): Promise<boolean> {
  const res = await fetch(`${base}/files/${fileId}`, { method: "DELETE", headers: authHeaders(accessToken) });
  return res.ok;
}
