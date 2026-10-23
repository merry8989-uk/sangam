import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { runBackup } from "@/lib/backupRun";
import { withLogging } from "@/lib/withLogging";

// Back up now, on demand.
export const POST = withLogging("backup:run:post", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runBackup(userId);
  if (!result.ok) return NextResponse.json({ error: result.error, runId: result.runId }, { status: 502 });
  return NextResponse.json(result);
});
