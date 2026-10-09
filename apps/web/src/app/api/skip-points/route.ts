import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { SKIP_CATEGORIES, SKIP_HIDE_BELOW } from "@/lib/skip";

// List skip points for a video: everyone's public ones plus the viewer's own
// private ones. Community segments the crowd has voted down are hidden.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mediaId = searchParams.get("mediaId");
  if (!mediaId) return NextResponse.json({ error: "mediaId is required" }, { status: 400 });

  const viewerId = await getViewerId(req);
  const rows = await prisma.skipSegment.findMany({
    where: {
      mediaId,
      OR: [{ visibility: "EVERYONE" }, ...(viewerId ? [{ authorId: viewerId }] : [])]
    },
    orderBy: { startSec: "asc" },
    include: { author: { select: { username: true } } }
  });

  const items = rows
    .filter((r) => r.authorId === viewerId || (r.visibility === "EVERYONE" && r.upvotes - r.downvotes >= SKIP_HIDE_BELOW))
    .map((r) => ({
      id: r.id,
      mediaId: r.mediaId,
      startSec: r.startSec,
      endSec: r.endSec,
      category: r.category,
      visibility: r.visibility,
      upvotes: r.upvotes,
      downvotes: r.downvotes,
      authorId: r.authorId,
      authorName: r.author.username,
      mine: r.authorId === viewerId
    }));

  return NextResponse.json({ items });
}

const Body = z.object({
  mediaId: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  category: z.enum(SKIP_CATEGORIES).default("NONSENSE"),
  visibility: z.enum(["SELF", "EVERYONE"]).default("SELF")
});

// Create a skip point. The author chooses whether it applies only to them
// (SELF) or to everyone who has skipping turned on (EVERYONE).
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { mediaId, startSec, endSec, category, visibility } = parsed.data;
  if (endSec <= startSec) {
    return NextResponse.json({ error: "End must be after start" }, { status: 400 });
  }
  if (endSec - startSec < 0.5) {
    return NextResponse.json({ error: "A segment must be at least half a second" }, { status: 400 });
  }
  if (endSec - startSec > 600) {
    return NextResponse.json({ error: "A segment may be at most 10 minutes" }, { status: 400 });
  }

  const media = await prisma.media.findUnique({ where: { id: mediaId }, select: { id: true } });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const segment = await prisma.skipSegment.create({
    data: { mediaId, authorId: userId, startSec, endSec, category, visibility }
  });
  return NextResponse.json({ segment }, { status: 201 });
}
