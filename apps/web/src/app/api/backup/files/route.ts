import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { listBackupFiles } from "@/lib/backupRestoreRun";

// Backup documents sitting in the connected account.
export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await listBackupFiles(userId);
  if (!result) {
    return NextResponse.json({ error: "Connect a backup account first.", files: [] }, { status: 409 });
  }
  return NextResponse.json(result);
}
