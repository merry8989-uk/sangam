import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mediaUrl } from "@/lib/s3";
import { processImage } from "@/lib/ai";

const Body = z.object({
  mediaKey: z.string().min(1),
  kind: z.enum(["IMAGE", "VIDEO"]).default("IMAGE"),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().nonnegative(),
  caption: z.string().max(300).optional()
});

const DAY_MS = 24 * 60 * 60 * 1000;

// Active stories from the people you follow, plus your own. Grouped by author.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ groups: [] });

  const following = await prisma.follow.findMany({
    where: { followerId: userId, status: "ACCEPTED" },
    select: { followeeId: true }
  });
  const authorIds = [userId, ...following.map((f) => f.followeeId)];

  const stories = await prisma.story.findMany({
    where: { authorId: { in: authorIds }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, displayName: true } }, media: true }
  });

  // group by author, preserving order
  const byAuthor = new Map<string, { author: unknown; stories: unknown[] }>();
  for (const s of stories) {
    const entry = byAuthor.get(s.authorId) ?? { author: s.author, stories: [] };
    for (const m of s.media) {
      entry.stories.push({
        id: s.id,
        caption: s.caption,
        createdAt: s.createdAt,
        url: mediaUrl(m.thumbnailKey ?? m.storageKey),
        kind: m.kind
      });
    }
    byAuthor.set(s.authorId, entry);
  }

  return NextResponse.json({ groups: [...byAuthor.values()] });
}

// Create a story that expires in 24 hours.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { mediaKey, kind, mimeType, sizeBytes, caption } = parsed.data;

  const story = await prisma.story.create({
    data: {
      authorId: userId,
      caption,
      expiresAt: new Date(Date.now() + DAY_MS),
      media: {
        create: { ownerId: userId, kind, storageKey: mediaKey, mimeType, sizeBytes }
      }
    },
    include: { media: true }
  });

  // Thumbnail for images (best effort).
  const image = story.media.find((m) => m.kind === "IMAGE");
  if (image) {
    try {
      const r = await processImage(image.storageKey);
      await prisma.media.update({
        where: { id: image.id },
        data: { width: r.width, height: r.height, thumbnailKey: r.thumbnailKey }
      });
    } catch {
      /* keep the story even if enrichment fails */
    }
  }

  return NextResponse.json({ id: story.id, expiresAt: story.expiresAt }, { status: 201 });
}
