import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { sampleFrames } from "@/lib/ai";

// Candidate poster frames. Only the media owner may ask, because generating
// them downloads the video and runs FFmpeg.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const media = await prisma.media.findUnique({
    where: { id: params.id },
    select: { ownerId: true, kind: true, storageKey: true }
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (media.ownerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (media.kind !== "VIDEO") return NextResponse.json({ error: "Not a video" }, { status: 400 });

  const raw = Number(new URL(req.url).searchParams.get("count") ?? 8);
  const count = Number.isFinite(raw) ? Math.min(20, Math.max(2, Math.floor(raw))) : 8;

  try {
    const result = await sampleFrames(media.storageKey, count);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not generate frames" }, { status: 502 });
  }
}
