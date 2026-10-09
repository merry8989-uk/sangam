import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewerId } from "@/lib/viewer";
import { zohoConfigured, zohoDc, buildAuthUrl, newOAuthState } from "@/lib/zoho";

// Kick off the Zoho consent flow. The state is kept in a short-lived cookie so
// the callback can prove the round trip started here.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.redirect(new URL("/settings", req.url));

  if (!zohoConfigured()) {
    return NextResponse.json(
      {
        error: "Zoho is not configured on this server.",
        hint: "Register a client at api-console.zoho.in, then set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET."
      },
      { status: 503 }
    );
  }

  const state = newOAuthState();
  cookies().set("zoho_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/"
  });

  const url = buildAuthUrl({ clientId: process.env.ZOHO_CLIENT_ID ?? "", dc: zohoDc(), state });
  return NextResponse.redirect(url);
}
