import { randomBytes } from "crypto";

// Google Drive as a second backup target. Google's OAuth is the same shape as
// Zoho's: register a client, get an id and secret, exchange a code for an
// access token plus a long-lived refresh token.

export const GOOGLE_PROVIDER = "GOOGLE";

// drive.file only lets us touch files this app created - not the user's whole
// Drive. That is the right scope for a backup.
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file"].join(" ");

export const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
export const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/google/callback`;
}

export function buildGoogleAuthUrl(opts: { clientId: string; state: string; redirect?: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirect ?? googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export function parseGoogleToken(data: Record<string, unknown>, now = Date.now()): {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
} | null {
  const access = data?.access_token;
  if (typeof access !== "string" || !access) return null;
  const expiresIn = Number(data.expires_in) || 3600;
  return {
    accessToken: access,
    refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
    expiresAt: now + expiresIn * 1000
  };
}

export function newGoogleState(): string {
  return randomBytes(16).toString("base64url");
}

// A Drive upload of a small file is a multipart/related body: a JSON part with
// the metadata, then the content part.
export function buildMultipartBody(opts: {
  boundary: string;
  metadata: Record<string, unknown>;
  content: string;
  contentType?: string;
}): string {
  const type = opts.contentType ?? "application/json";
  return [
    `--${opts.boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(opts.metadata),
    `--${opts.boundary}`,
    `Content-Type: ${type}`,
    "",
    opts.content,
    `--${opts.boundary}--`,
    ""
  ].join("\r\n");
}
