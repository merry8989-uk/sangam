import { NextResponse } from "next/server";
import { getViewerId } from "@/lib/viewer";
import { listSharedWithMe } from "@/lib/driveAccess";
import { withLogging } from "@/lib/withLogging";

// The "Shared with me" list.
export const GET = withLogging("drive:shared:get", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ items: await listSharedWithMe(userId) });
});
