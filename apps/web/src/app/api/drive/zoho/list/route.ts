import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { withZohoToken, workDriveBaseForAccount } from "@/lib/zohoAccount";
import { getMyFolderId, listFiles } from "@/lib/zohoWorkDrive";

// What is in the linked WorkDrive account, so the drive can show it.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const auth = await withZohoToken(userId);
  if (!auth) return NextResponse.json({ error: "Zoho is not connected." }, { status: 409 });

  const base = workDriveBaseForAccount(auth.account);
  const folderId = await getMyFolderId(base, auth.accessToken);
  if (!folderId) return NextResponse.json({ error: "Could not find your Zoho folder." }, { status: 502 });

  const files = await listFiles(base, auth.accessToken, folderId);
  return NextResponse.json({ files, account: { label: auth.account.label, apiDomain: auth.account.apiDomain } });
}
