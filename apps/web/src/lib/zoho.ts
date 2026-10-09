import { randomBytes } from "crypto";

// Zoho WorkDrive integration. Zoho runs a proper, self-serve OAuth 2.0 setup:
// you register a client in their API console yourself and get a client id and
// secret immediately, with no approval step.
//
// Data centre matters. Zoho stores data per region, and the India DC keeps it
// on Indian soil, which is what this project wants. The DC changes both the
// accounts host and the API host, so it is derived, never hard-coded.

export type ZohoDc = "in" | "com" | "eu" | "com.au" | "jp" | "zohocloud.ca" | "sa" | "uk";

export const ZOHO_PROVIDER = "ZOHO";

// WorkDrive scopes we need: read files, create files (including native
// documents/sheets/slides), and delete.
export const ZOHO_SCOPES = [
  "WorkDrive.files.ALL",
  "WorkDrive.folders.ALL",
  "ZohoFiles.files.ALL"
].join(",");

export function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
}

export function zohoDc(): ZohoDc {
  const dc = (process.env.ZOHO_DC || "in").toLowerCase();
  const allowed: ZohoDc[] = ["in", "com", "eu", "com.au", "jp", "zohocloud.ca", "sa", "uk"];
  return (allowed.includes(dc as ZohoDc) ? dc : "in") as ZohoDc;
}

// Where the user signs in and where tokens are minted.
export function accountsBaseFor(dc: ZohoDc): string {
  return `https://accounts.zoho.${dc}`;
}

// Where the service APIs live (returned as api_domain on a token response).
export function apiBaseFor(dc: ZohoDc): string {
  return `https://www.zohoapis.${dc}`;
}

export function workDriveBaseFor(dc: ZohoDc): string {
  return `${apiBaseFor(dc)}/workdrive/api/v1`;
}

// Large uploads use a separate host per DC.
export function uploadBaseFor(dc: ZohoDc): string {
  return `https://upload.zoho.${dc}/workdrive-api/v1`;
}

export function redirectUri(): string {
  return process.env.ZOHO_REDIRECT_URI || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/zoho/callback`;
}

// The consent URL the user is sent to. `access_type=offline` is what gets us a
// refresh token, so the link keeps working after an hour.
export function buildAuthUrl(opts: {
  clientId: string;
  dc: ZohoDc;
  state: string;
  redirect?: string;
  scopes?: string;
}): string {
  const params = new URLSearchParams({
    scope: opts.scopes ?? ZOHO_SCOPES,
    client_id: opts.clientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: opts.redirect ?? redirectUri(),
    state: opts.state
  });
  return `${accountsBaseFor(opts.dc)}/oauth/v2/auth?${params.toString()}`;
}

export type ZohoToken = {
  accessToken: string;
  refreshToken: string | null;
  apiDomain: string | null;
  expiresAt: number; // epoch ms
};

// Zoho answers a token request with a flat object. Anything without an
// access_token is an error, and the error text is worth surfacing.
export function parseTokenResponse(data: Record<string, unknown>, now = Date.now()): ZohoToken | null {
  const access = data?.access_token;
  if (typeof access !== "string" || !access) return null;
  const expiresIn = Number(data.expires_in) || 3600;
  return {
    accessToken: access,
    refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
    apiDomain: typeof data.api_domain === "string" && data.api_domain ? data.api_domain : null,
    expiresAt: now + expiresIn * 1000
  };
}

export function tokenError(data: Record<string, unknown>): string | null {
  if (typeof data?.error === "string") return data.error;
  return null;
}

// Treat a token as spent a minute early so a request never races the expiry.
export function isExpired(expiresAt: number, now = Date.now(), skewMs = 60_000): boolean {
  return !expiresAt || expiresAt - skewMs <= now;
}

// A short random value to carry through the OAuth round trip.
export function newOAuthState(): string {
  return randomBytes(16).toString("base64url");
}

export function stateMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
