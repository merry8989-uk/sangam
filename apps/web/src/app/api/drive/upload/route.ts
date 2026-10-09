import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerId } from "@/lib/viewer";
import { presignUpload } from "@/lib/s3";
import { newStorageKey, classifyUpload, MAX_UPLOAD_BYTES } from "@/lib/drive";

const Body = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().min(3).max(200),
  sizeBytes: z.number().int().min(0).max(MAX_UPLOAD_BYTES)
});

// Pre-sign a direct upload into the drive. The client PUTs the bytes, then
// registers the item with POST /api/drive.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { filename, contentType, sizeBytes } = parsed.data;

  if (sizeBytes > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too large" }, { status: 413 });
  }

  const key = newStorageKey(userId, filename);
  const url = await presignUpload(key, contentType);

  return NextResponse.json({ key, url, kind: classifyUpload(contentType) });
}
