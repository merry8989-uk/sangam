import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Connected-account credentials are sensitive, so they are encrypted at rest
// and never returned to a client. AES-256-GCM gives us confidentiality and a
// tamper check in one value.
const RAW = process.env.SECRETS_KEY || process.env.NEXTAUTH_SECRET || "dev-only-secrets-key";

function key(): Buffer {
  return createHash("sha256").update(RAW).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), enc.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string | null {
  if (!blob) return null;
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const enc = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key or tampered ciphertext.
    return null;
  }
}

// A short, safe way to show that something is stored without revealing it.
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 6) return "******";
  return `${plain.slice(0, 3)}${"*".repeat(6)}${plain.slice(-3)}`;
}
