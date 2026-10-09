import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Polled by the composer while a video post is being transcoded.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      media: {
        select: {
          id: true,
          kind: true,
          thumbnailKey: true,
          hlsKey: true,
          previewKey: true,
          durationMs: true
        }
      }
    }
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}
