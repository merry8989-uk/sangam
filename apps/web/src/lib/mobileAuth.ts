import { createHmac, timingSafeEqual } from "crypto";

// Bearer tokens for the mobile app. The web app uses NextAuth session cookies,
// which React Native cannot easily reuse, so mobile signs in once and gets a
// token that every API route accepts via `Authorization: Bearer <token>`.
const SECRET =
  process.env.MOBILE_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "dev-only-secret";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function issueMobileToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = userId + "." + exp;
  return payload + "." + sign(payload);
}

export function verifyMobileToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = sign(userId + "." + exp);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  if (!Number(exp) || Number(exp) < Date.now()) return null;
  return userId;
}
