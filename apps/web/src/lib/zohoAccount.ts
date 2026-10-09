import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./secrets";
import { ZOHO_PROVIDER, zohoDc, accountsBaseFor, apiBaseFor, workDriveBaseFor, parseTokenResponse, isExpired } from "./zoho";

// What we keep for a linked Zoho account. Both tokens live in one encrypted
// blob; only the api domain and the account name are stored in the clear.
type StoredZoho = {
  refreshToken: string | null;
  accessToken: string;
  expiresAt: number;
};

export type ZohoAccount = {
  id: string;
  label: string;
  apiDomain: string;
  dc: string;
  expiresAt: number;
  refreshToken: string | null;
  accessToken: string;
};

export async function saveZohoLink(
  userId: string,
  token: { accessToken: string; refreshToken: string | null; expiresAt: number; apiDomain: string | null },
  label: string
): Promise<void> {
  const dc = zohoDc();
  const stored: StoredZoho = {
    refreshToken: token.refreshToken,
    accessToken: token.accessToken,
    expiresAt: token.expiresAt
  };

  await prisma.linkedAccount.upsert({
    where: { userId_provider: { userId, provider: ZOHO_PROVIDER } },
    create: {
      userId,
      provider: ZOHO_PROVIDER,
      label,
      method: "OAUTH",
      status: "LINKED",
      secretCipher: encryptSecret(JSON.stringify(stored)),
      meta: { apiDomain: token.apiDomain ?? apiBaseFor(dc), dc }
    },
    update: {
      label,
      method: "OAUTH",
      status: "LINKED",
      secretCipher: encryptSecret(JSON.stringify(stored)),
      meta: { apiDomain: token.apiDomain ?? apiBaseFor(dc), dc }
    }
  });
}

export async function getZohoAccount(userId: string): Promise<ZohoAccount | null> {
  const row = await prisma.linkedAccount.findUnique({
    where: { userId_provider: { userId, provider: ZOHO_PROVIDER } }
  });
  if (!row) return null;

  const raw = decryptSecret(row.secretCipher);
  if (!raw) return null;

  let stored: StoredZoho;
  try {
    stored = JSON.parse(raw) as StoredZoho;
  } catch {
    return null;
  }

  const meta = (row.meta ?? {}) as { apiDomain?: string; dc?: string };
  const dc = meta.dc ?? zohoDc();

  return {
    id: row.id,
    label: row.label,
    apiDomain: meta.apiDomain ?? apiBaseFor(dc as never),
    dc,
    expiresAt: stored.expiresAt,
    refreshToken: stored.refreshToken,
    accessToken: stored.accessToken
  };
}

// Swap the refresh token for a new access token, and persist the result.
export async function refreshZohoAccess(userId: string, account: ZohoAccount): Promise<string | null> {
  if (!account.refreshToken) return null;

  const body = new URLSearchParams({
    refresh_token: account.refreshToken,
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
    grant_type: "refresh_token"
  });

  try {
    const res = await fetch(`${accountsBaseFor(account.dc as never)}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const token = parseTokenResponse(data);
    if (!token) return null;

    // A refresh response usually omits refresh_token; keep the one we have.
    await saveZohoLink(
      userId,
      {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? account.refreshToken,
        expiresAt: token.expiresAt,
        apiDomain: token.apiDomain ?? account.apiDomain
      },
      account.label
    );
    return token.accessToken;
  } catch {
    return null;
  }
}

// A usable access token, refreshing first if the stored one is spent.
export async function withZohoToken(userId: string): Promise<{ account: ZohoAccount; accessToken: string } | null> {
  const account = await getZohoAccount(userId);
  if (!account) return null;

  if (!isExpired(account.expiresAt)) {
    return { account, accessToken: account.accessToken };
  }

  const fresh = await refreshZohoAccess(userId, account);
  if (!fresh) return null;
  return { account, accessToken: fresh };
}

export function workDriveBaseForAccount(account: ZohoAccount): string {
  return `${account.apiDomain.replace(/\/$/, "")}/workdrive/api/v1`;
}
