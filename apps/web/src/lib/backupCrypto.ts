import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Backups leave our servers, so the document is encrypted before it is
// uploaded. Two ways to hold the key:
//
//   server     - a key derived from a server secret plus the user id, so every
//                user has their own key. Scheduled backups can run without the
//                user, and we can restore for them.
//   passphrase - a key derived from a passphrase the user chose. The file is
//                useless without it. Because scheduled backups must run while
//                the user is away, the passphrase is also kept on our side,
//                encrypted under the server key - so this protects the file in
//                Drive, but it is not zero-knowledge.
export const BACKUP_ENCRYPTION_MODES = ["off", "server", "passphrase"] as const;
export type BackupEncryptionMode = (typeof BACKUP_ENCRYPTION_MODES)[number];

export const ENVELOPE_FORMAT = "sangam-backup";
export const ENVELOPE_VERSION = 1;

const SECRET = process.env.BACKUP_KEY || process.env.SECRETS_KEY || process.env.NEXTAUTH_SECRET || "dev-only-backup-key";
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

export function isBackupEncryptionMode(value: unknown): value is BackupEncryptionMode {
  return typeof value === "string" && (BACKUP_ENCRYPTION_MODES as readonly string[]).includes(value);
}

// One key per user, so one user's key cannot open another's backup.
export function deriveServerKey(userId: string, secret: string = SECRET): Buffer {
  return createHash("sha256").update(`${secret}|${userId}|backup-v1`).digest();
}

export function derivePassphraseKey(passphrase: string, saltB64: string): Buffer {
  const salt = Buffer.from(saltB64, "base64url");
  return scryptSync(passphrase.normalize("NFKC"), salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
}

export function newSalt(): string {
  return randomBytes(16).toString("base64url");
}

export type Envelope = {
  format: string;
  version: number;
  encrypted: true;
  alg: "AES-256-GCM";
  kdf: "server" | "scrypt";
  salt?: string;
  iv: string;
  tag: string;
  ciphertext: string;
  // Left in the clear so the file is identifiable without the key.
  period: string;
  createdAt: string;
  app: string;
};

function seal(plaintext: string, key: Buffer, meta: { kdf: "server" | "scrypt"; salt?: string; period: string; createdAt: string }): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: Envelope = {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    encrypted: true,
    alg: "AES-256-GCM",
    kdf: meta.kdf,
    ...(meta.salt ? { salt: meta.salt } : {}),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: enc.toString("base64url"),
    period: meta.period,
    createdAt: meta.createdAt,
    app: "Sangam"
  };
  return JSON.stringify(envelope, null, 2);
}

// Wrap the backup document. `off` returns the plaintext untouched.
export function encryptBackup(
  plaintext: string,
  opts: { mode: string; userId: string; period: string; createdAt: string; passphrase?: string | null }
): string {
  if (opts.mode !== "server" && opts.mode !== "passphrase") return plaintext;

  if (opts.mode === "passphrase") {
    if (!opts.passphrase) throw new Error("A passphrase is required for passphrase encryption.");
    const salt = newSalt();
    const key = derivePassphraseKey(opts.passphrase, salt);
    return seal(plaintext, key, { kdf: "scrypt", salt, period: opts.period, createdAt: opts.createdAt });
  }

  return seal(plaintext, deriveServerKey(opts.userId), { kdf: "server", period: opts.period, createdAt: opts.createdAt });
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { format?: string; encrypted?: boolean };
    return parsed?.format === ENVELOPE_FORMAT && parsed?.encrypted === true;
  } catch {
    return false;
  }
}

// Open a backup document. Returns null when the key is wrong or the file has
// been tampered with (GCM authentication fails).
export function decryptBackup(text: string, opts: { userId: string; passphrase?: string | null }): string | null {
  let env: Envelope;
  try {
    env = JSON.parse(text) as Envelope;
  } catch {
    return null;
  }
  if (env?.format !== ENVELOPE_FORMAT || env.encrypted !== true) return null;

  try {
    const key =
      env.kdf === "scrypt"
        ? opts.passphrase
          ? derivePassphraseKey(opts.passphrase, env.salt ?? "")
          : null
        : deriveServerKey(opts.userId);
    if (!key) return null;

    const iv = Buffer.from(env.iv, "base64url");
    const tag = Buffer.from(env.tag, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(env.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// A backup filename that says it is encrypted.
export function backupFileNameFor(period: string, encrypted: boolean): string {
  return encrypted ? `sangam-backup-${period}.enc.json` : `sangam-backup-${period}.json`;
}

// Storing the passphrase on our side so scheduled runs work. It is encrypted
// with the server key; the UI says plainly what that does and does not buy.
export function sealPassphrase(passphrase: string, userId: string): string {
  return encryptBackup(passphrase, {
    mode: "server",
    userId,
    period: "passphrase",
    createdAt: new Date().toISOString()
  });
}

export function openPassphrase(cipher: string, userId: string): string | null {
  if (!cipher) return null;
  return decryptBackup(cipher, { userId });
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
