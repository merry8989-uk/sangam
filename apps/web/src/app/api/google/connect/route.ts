import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewerId } from "@/lib/viewer";
import { googleConfigured, buildGoogleAuthUrl, newGoogleState } from "@/lib/google";

export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.redirect(new URL("/settings", req.url));

  if (!googleConfigured()) {
    return NextResponse.json(
      {
        error: "Google Drive is not configured on this server.",
        hint: "Create an OAuth client in the Google Cloud console, then set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
      },
      { status: 503 }
    );
  }

  const state = newGoogleState();
  cookies().set("google_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/"
  });

  return NextResponse.redirect(buildGoogleAuthUrl({ clientId: process.env.GOOGLE_CLIENT_ID ?? "", state }));
}
