import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { removePost } from "@/lib/search";
import { withLogging } from "@/lib/withLogging";

// Read one post as JSON (used by the mobile app).
export const GET = withLogging("posts:id:get", async (req: Request, { params }: { params: { id: string } }) => {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    include: { author: { select: { username: true, displayName: true } }, media: true }
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewerId = await getViewerId(req);
  const isOwner = Boolean(viewerId) && viewerId === post.authorId;

  // Every tier is enforced here, not only PRIVATE. A FOLLOWERS post used to be
  // returned to anyone who knew the id - and the id is in the public feed - so
  // the tier the feed advertises was not actually a boundary.
  if (!isOwner) {
    if (post.visibility === "PRIVATE") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (post.visibility === "FOLLOWERS") {
      const follows = viewerId
        ? await prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: post.authorId } },
            select: { status: true }
          })
        : null;
      if (!follows || follows.status !== "ACCEPTED") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
  }

  return NextResponse.json({ post, isOwner });
});

// Delete a post. Only the author may delete it. Media, likes, comments and
// hashtag links cascade with the row.
export const DELETE = withLogging("posts:id:delete", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const post = await prisma.post.findUnique({ where: { id: params.id }, select: { authorId: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.authorId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.post.delete({ where: { id: params.id } });
  await removePost(params.id);
  return NextResponse.json({ ok: true });
});
