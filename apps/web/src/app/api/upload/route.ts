import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { presignUpload } from "@/lib/s3";

const Body = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(3),
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO"])
});

// Returns a pre-signed PUT URL so the browser uploads bytes directly to
// India-region object storage - the app tier never proxies large media.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { filename, contentType, kind } = parsed.data;

  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  const key = `raw/${userId}/${randomUUID()}.${ext}`;
  const url = await presignUpload(key, contentType);

  return NextResponse.json({ key, url, kind, contentType });
}
