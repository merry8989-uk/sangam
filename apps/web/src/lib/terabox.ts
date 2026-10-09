import { createHash } from "crypto";

// Terabox integration. Two paths exist and they are not equally supported:
//
//  1. OAUTH  - Terabox runs an integration programme with an OAuth device-code
//     flow. It needs a client id / secret issued by Terabox, so it only turns
//     on when those are configured.
//  2. SESSION_TOKEN - Terabox has no open OAuth for ordinary users, so the
//     community route is the `ndus` session token copied from a signed-in
//     browser. It is unofficial, may break, and may not be permitted by their
//     terms - the UI says so plainly.
export const TERABOX_PROVIDER = "TERABOX";

export const TERABOX_SIGNUP_URL = "https://www.terabox.com/";
export const TERABOX_APP_URL = "https://www.terabox.com/main";

export function teraboxOAuthConfigured(): boolean {
  return Boolean(process.env.TERABOX_CLIENT_ID && process.env.TERABOX_CLIENT_SECRET);
}

export function teraboxApiBase(): string {
  return process.env.TERABOX_API_BASE || "https://www.terabox.com";
}

// Domains Terabox share links come from (they use several regional brands).
const SHARE_HOSTS = [
  "terabox.com",
  "1024terabox.com",
  "teraboxapp.com",
  "nephobox.com",
  "4funbox.com",
  "mirrobox.com",
  "momerybox.com",
  "tibibox.com",
  "freeterabox.com",
  "1024tera.com"
];

export function isTeraboxUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SHARE_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

// Share links look like /s/1AbCdEfGh or /sharing/link?surl=AbCdEfGh.
export function extractShareCode(url: string): string | null {
  if (!isTeraboxUrl(url)) return null;
  try {
    const u = new URL(url);
    const surl = u.searchParams.get("surl");
    if (surl) return surl;
    const m = u.pathname.match(/\/s\/1([A-Za-z0-9_-]{5,})/);
    if (m) return "1" + m[1];
    const seg = u.pathname.split("/").filter(Boolean);
    const last = seg[seg.length - 1];
    return last && last.length >= 6 ? last : null;
  } catch {
    return null;
  }
}

// A canonical link we can store, or null when it is not a Terabox link.
export function normalizeShareLink(url: string): string | null {
  if (!isTeraboxUrl(url)) return null;
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

// The `ndus` session token is a long opaque string.
export function looksLikeNdusToken(token: string): boolean {
  const t = (token || "").trim();
  return t.length >= 16 && t.length <= 4096 && !/\s/.test(t);
}

// Terabox's documented signature: md5(client_id_timestamp_client_secret_private_secret)
export function oauthSign(clientId: string, timestamp: number, clientSecret: string, privateSecret: string): string {
  return createHash("md5").update(`${clientId}_${timestamp}_${clientSecret}_${privateSecret}`).digest("hex");
}

// Where to send someone to get their session token, for the advanced path.
export const TOKEN_HELP =
  "Open terabox.com in a browser, sign in, then DevTools > Network > any request > Request Headers > Cookie > copy the value of `ndus`.";
