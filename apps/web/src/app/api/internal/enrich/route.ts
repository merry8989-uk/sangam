import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enrichMedia, fanOut } from "@/lib/media-pipeline";
import { recordJob, recordRoute } from "@/lib/metrics";

const Body = z.object({
  postId: z.string().min(1),
  userId: z.string().min(1),
  visibility: z.string().default("PUBLIC")
});

// Called by the media worker (apps/worker), not by the browser. Does the
// database + storage work for one post and marks it READY.
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("enrich", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { postId, userId, visibility } = parsed.data;

  try {
    await enrichMedia(postId);
    await prisma.post.update({ where: { id: postId }, data: { status: "READY" } });
    await fanOut(userId, postId, visibility);
    await recordJob("enrich", true);
    await recordRoute("enrich", 200);
    return NextResponse.json({ ok: true });
  } catch {
    await prisma.post.update({ where: { id: postId }, data: { status: "FAILED" } }).catch(() => {});
    await recordJob("enrich", false);
    await recordRoute("enrich", 502);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 502 });
  }
}
