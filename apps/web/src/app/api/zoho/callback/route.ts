import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewerId } from "@/lib/viewer";
import { zohoDc, accountsBaseFor, parseTokenResponse, stateMatches } from "@/lib/zoho";
import { saveZohoLink } from "@/lib/zohoAccount";

// Zoho sends the user back here with a one-time code. Exchange it for tokens
// and remember the account.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const back = (q: string) => NextResponse.redirect(new URL(`/drive?zoho=${q}`, req.url));

  if (error) return back("denied");

  const userId = await getViewerId(req);
  if (!userId) return NextResponse.redirect(new URL("/settings", req.url));

  const expected = cookies().get("zoho_state")?.value;
  if (!stateMatches(state, expected)) return back("badstate");
  cookies().delete("zoho_state");

  if (!code) return back("nocode");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
    redirect_uri: process.env.ZOHO_REDIRECT_URI || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/zoho/callback`,
    code
  });

  try {
    const res = await fetch(`${accountsBaseFor(zohoDc())}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const data = (await res.json()) as Record<string, unknown>;
    const token = parseTokenResponse(data);
    if (!token) return back("tokenfail");

    // Zoho reports the account's own data centre; prefer it when present.
    const apiDomain = token.apiDomain ?? "";
    const label = apiDomain.replace(/^https?:\/\//, "").replace(/\/$/, "") || "Zoho WorkDrive";

    await saveZohoLink(userId, token, label);
    return back("linked");
  } catch {
    return back("tokenfail");
  }
}
