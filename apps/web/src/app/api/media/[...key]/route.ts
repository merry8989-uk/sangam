import { NextResponse } from "next/server";
import { mediaUrl } from "@/lib/s3";

// Redirect to the object-storage URL for a media key. Keeps the bucket base
// server-side so clients (web and the Android app) only ever need a key.
export async function GET(_req: Request, { params }: { params: { key: string[] } }) {
  const key = (params.key ?? []).join("/");
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(mediaUrl(key), 302);
}
