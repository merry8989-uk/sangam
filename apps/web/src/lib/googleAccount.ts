import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secrets";
import { GOOGLE_PROVIDER, GOOGLE_TOKEN_URL, parseGoogleToken } from "./google";

type StoredGoogle = { refreshToken: string | null; accessToken: string; expiresAt: number };

export type GoogleAccount = {
  id: string;
  label: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
};

export async function saveGoogleLink(
  userId: string,
  token: { accessToken: string; refreshToken: string | null; expiresAt: number },
  label: string
): Promise<void> {
  const stored: StoredGoogle = token;
  await prisma.linkedAccount.upsert({
    where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } },
    create: {
      userId,
      provider: GOOGLE_PROVIDER,
      label,
      method: "OAUTH",
      status: "LINKED",
      secretCipher: encryptSecret(JSON.stringify(stored))
    },
    update: {
      label,
      method: "OAUTH",
      status: "LINKED",
      secretCipher: encryptSecret(JSON.stringify(stored))
    }
  });
}

export async function getGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  const row = await prisma.linkedAccount.findUnique({
    where: { userId_provider: { userId, provider: GOOGLE_PROVIDER } }
  });
  if (!row) return null;
  const raw = decryptSecret(row.secretCipher);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredGoogle;
    return { id: row.id, label: row.label, ...stored };
  } catch {
    return null;
  }
}

export async function withGoogleToken(userId: string): Promise<{ account: GoogleAccount; accessToken: string } | null> {
  const account = await getGoogleAccount(userId);
  if (!account) return null;

  if (account.expiresAt - 60_000 > Date.now()) {
    return { account, accessToken: account.accessToken };
  }
  if (!account.refreshToken) return null;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: account.refreshToken,
    grant_type: "refresh_token"
  });

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const token = parseGoogleToken(data);
    if (!token) return null;
    await saveGoogleLink(
      userId,
      { accessToken: token.accessToken, refreshToken: token.refreshToken ?? account.refreshToken, expiresAt: token.expiresAt },
      account.label
    );
    return { account, accessToken: token.accessToken };
  } catch {
    return null;
  }
}
