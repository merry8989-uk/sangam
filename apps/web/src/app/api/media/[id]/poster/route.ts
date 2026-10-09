import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { extractPoster } from "@/lib/ai";

const Body = z.object({ atSec: z.number().min(0).max(24 * 3600) });

// Set the poster to the frame at `atSec`. Only the media owner may do this.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const media = await prisma.media.findUnique({
    where: { id: params.id },
    select: { ownerId: true, kind: true, storageKey: true }
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (media.ownerId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (media.kind !== "VIDEO") return NextResponse.json({ error: "Not a video" }, { status: 400 });

  try {
    const result = await extractPoster(media.storageKey, parsed.data.atSec);
    await prisma.media.update({
      where: { id: params.id },
      data: { thumbnailKey: result.thumbnailKey }
    });
    return NextResponse.json({ thumbnailKey: result.thumbnailKey, atSec: result.atSec });
  } catch {
    return NextResponse.json({ error: "Could not set the poster" }, { status: 502 });
  }
}
