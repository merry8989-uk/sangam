import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { encryptSecret, maskSecret, decryptSecret } from "@/lib/secrets";
import { TERABOX_PROVIDER, looksLikeNdusToken, teraboxOAuthConfigured } from "@/lib/terabox";
import { ZOHO_PROVIDER, zohoConfigured } from "@/lib/zoho";

const PROVIDERS = [TERABOX_PROVIDER, ZOHO_PROVIDER] as const;

// Which third-party accounts this user has connected. Secrets never leave here.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.linkedAccount.findMany({
    where: { userId },
    orderBy: { linkedAt: "desc" }
  });

  return NextResponse.json({
    accounts: accounts.map((a) => {
      const plain = a.secretCipher ? decryptSecret(a.secretCipher) : null;
      return {
        id: a.id,
        provider: a.provider,
        label: a.label,
        status: a.status,
        method: a.method,
        linkedAt: a.linkedAt,
        // Only ever a masked hint, never the value itself.
        tokenHint: plain ? maskSecret(plain) : null
      };
    }),
    terabox: {
      oauthAvailable: teraboxOAuthConfigured()
    },
    zoho: {
      configured: zohoConfigured(),
      linked: accounts.some((a) => a.provider === ZOHO_PROVIDER)
    }
  });
}

const LinkBody = z.object({
  provider: z.enum(PROVIDERS),
  label: z.string().max(200).optional(),
  // The `ndus` session token, for the advanced (unofficial) path.
  token: z.string().max(4096).optional()
});

// Connect an account. We never accept or store a password.
export async function POST(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = LinkBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { provider, label, token } = parsed.data;

  if (token && !looksLikeNdusToken(token)) {
    return NextResponse.json({ error: "That does not look like a Terabox session token." }, { status: 400 });
  }

  const account = await prisma.linkedAccount.upsert({
    where: { userId_provider: { userId, provider } },
    create: {
      userId,
      provider,
      label: label ?? "",
      method: token ? "SESSION_TOKEN" : "OAUTH",
      secretCipher: token ? encryptSecret(token) : ""
    },
    update: {
      label: label ?? "",
      method: token ? "SESSION_TOKEN" : "OAUTH",
      secretCipher: token ? encryptSecret(token) : "",
      status: "LINKED"
    }
  });

  return NextResponse.json({
    account: { id: account.id, provider: account.provider, label: account.label, method: account.method, status: account.status }
  }, { status: 201 });
}
