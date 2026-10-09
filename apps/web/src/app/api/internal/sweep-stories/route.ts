import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/s3";
import { recordJob, recordRoute } from "@/lib/metrics";

const THUMB_WIDTHS = [320, 640, 1080];

// Deletes stories past their 24h expiry, along with their stored objects.
// Expiry is already enforced on read; this reclaims the rows and the bytes.
// Called by a scheduler (see docs/JOBS.md).
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("sweep-stories", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expired = await prisma.story.findMany({
    where: { expiresAt: { lt: new Date() } },
    include: { media: true },
    take: 200
  });

  let removed = 0;
  let objects = 0;

  for (const story of expired) {
    for (const m of story.media) {
      const base = m.storageKey.replace(/\.[^./]+$/, "");
      const keys = [
        ...new Set([
          m.storageKey,
          ...(m.thumbnailKey ? [m.thumbnailKey] : []),
          ...THUMB_WIDTHS.map((w) => `${base}_w${w}.webp`)
        ])
      ];
      for (const key of keys) {
        try {
          await deleteObject(key);
          objects += 1;
        } catch {
          // already gone, or storage hiccup - keep sweeping
        }
      }
    }
    // Media rows cascade with the story.
    await prisma.story.delete({ where: { id: story.id } });
    removed += 1;
  }

  await recordJob("sweep-stories", true);
  await recordRoute("sweep-stories", 200);
  return NextResponse.json({ removed, objects });
}
