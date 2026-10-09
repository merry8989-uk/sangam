import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewerId } from "@/lib/viewer";
import { GOOGLE_TOKEN_URL, parseGoogleToken, googleRedirectUri } from "@/lib/google";
import { saveGoogleLink } from "@/lib/googleAccount";
import { stateMatches } from "@/lib/zoho";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const back = (q: string) => NextResponse.redirect(new URL(`/settings?google=${q}`, req.url));

  if (error) return back("denied");
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.redirect(new URL("/settings", req.url));

  const expected = cookies().get("google_state")?.value;
  if (!stateMatches(state, expected)) return back("badstate");
  cookies().delete("google_state");
  if (!code) return back("nocode");

  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code"
  });

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = (await res.json()) as Record<string, unknown>;
    const token = parseGoogleToken(data);
    if (!token) return back("tokenfail");

    await saveGoogleLink(userId, token, "Google Drive");
    return back("linked");
  } catch {
    return back("tokenfail");
  }
}
