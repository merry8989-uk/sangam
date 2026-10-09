import { NextResponse } from "next/server";
import { dueBackups, runBackup } from "@/lib/backupRun";
import { recordJob, recordRoute } from "@/lib/metrics";

// Runs every backup that is due. Call this from a scheduler once an hour
// (see docs/JOBS.md). Guarded by the same internal secret as the other jobs.
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("run-backups", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const due = await dueBackups(new Date());
  let ok = 0;
  let failed = 0;

  for (const userId of due) {
    const result = await runBackup(userId);
    if (result.ok) ok++;
    else failed++;
  }

  await recordJob("run-backups", ok, failed);
  await recordRoute("run-backups", 200);
  return NextResponse.json({ due: due.length, ok, failed });
}
