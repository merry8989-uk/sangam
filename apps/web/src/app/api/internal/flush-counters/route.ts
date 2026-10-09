import { NextResponse } from "next/server";
import { flushCounters } from "@/lib/counters";

// Called by a scheduler / worker (see docs/ROADMAP.md), not by the browser.
// Protected by a shared secret header.
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await flushCounters();
  return NextResponse.json(result);
}
