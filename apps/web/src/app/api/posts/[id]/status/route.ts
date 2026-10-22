import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";

// Polled by the composer while a video post is being transcoded.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Only the author polls this, while their own upload is transcoding. It used
  // to answer anyone who knew an id, and it returns media keys - including for
  // a private post - so it was a way to locate media that was not public.
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      authorId: true,
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
  if (post.authorId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { authorId: _omit, ...safe } = post;
  void _omit;
  return NextResponse.json(safe);
}
