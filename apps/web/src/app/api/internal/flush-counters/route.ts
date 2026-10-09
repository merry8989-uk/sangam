import { NextResponse } from "next/server";
import { flushCounters } from "@/lib/counters";
import { recordJob, recordRoute } from "@/lib/metrics";

// Called by a scheduler / worker (see docs/ROADMAP.md), not by the browser.
// Protected by a shared secret header.
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("flush-counters", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await flushCounters();
    await recordJob("flush-counters", true);
    await recordRoute("flush-counters", 200);
    return NextResponse.json(result);
  } catch {
    await recordJob("flush-counters", false);
    await recordRoute("flush-counters", 500);
    return NextResponse.json({ error: "Flush failed" }, { status: 500 });
  }
}
