import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { zohoConfigured, zohoDc, accountsBaseFor } from "@/lib/zoho";
import { getZohoAccount } from "@/lib/zohoAccount";

export async function GET(req: Request) {
  const userId = await getViewerId(req);
  const configured = zohoConfigured();
  const dc = zohoDc();

  if (!userId) {
    return NextResponse.json({ configured, dc, accountsBase: accountsBaseFor(dc), linked: false, account: null });
  }

  const account = await getZohoAccount(userId);
  return NextResponse.json({
    configured,
    dc,
    accountsBase: accountsBaseFor(dc),
    linked: Boolean(account),
    account: account ? { id: account.id, label: account.label, apiDomain: account.apiDomain } : null
  });
}
