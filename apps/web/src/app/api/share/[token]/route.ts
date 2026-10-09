import { NextResponse } from "next/server";
import { loadByShareToken } from "@/lib/driveAccess";

// Open a link share. No account needed - the token is the key.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const found = await loadByShareToken(params.token);
  if (!found) return NextResponse.json({ error: "This link is not valid or has expired" }, { status: 404 });

  const { item, level } = found;
  return NextResponse.json({
    item: {
      id: item.id,
      kind: item.kind,
      name: item.name,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      storageKey: item.storageKey,
      content: level === "VIEW" || level === "EDIT" ? item.content : "",
      sourceUrl: item.sourceUrl,
      updatedAt: item.updatedAt
    },
    access: level
  });
}
