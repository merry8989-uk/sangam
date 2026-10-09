import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { teraboxOAuthConfigured, teraboxApiBase, oauthSign } from "@/lib/terabox";

// Start the official Terabox OAuth device-code flow (QR scan in the app).
// Only works when Terabox has issued us a client id and secret.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = process.env.TERABOX_CLIENT_ID ?? "";
  const clientSecret = process.env.TERABOX_CLIENT_SECRET ?? "";
  const privateSecret = process.env.TERABOX_PRIVATE_SECRET ?? "";

  if (!teraboxOAuthConfigured()) {
    return NextResponse.json(
      {
        error: "Terabox OAuth is not configured on this server.",
        hint: "Apply for the Terabox integration programme, then set TERABOX_CLIENT_ID and TERABOX_CLIENT_SECRET."
      },
      { status: 503 }
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const sign = oauthSign(clientId, timestamp, clientSecret, privateSecret);

  try {
    const res = await fetch(`${teraboxApiBase()}/oauth/devicecode?client_id=${encodeURIComponent(clientId)}&sign=${sign}&timestamp=${timestamp}`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Terabox refused the device-code request." }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ device: data?.data ?? data });
  } catch {
    return NextResponse.json({ error: "Could not reach Terabox." }, { status: 502 });
  }
}
