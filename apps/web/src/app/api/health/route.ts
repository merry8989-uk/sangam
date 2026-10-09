import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { recordRoute } from "@/lib/metrics";

// Liveness / readiness probe: reports database and cache connectivity.
export async function GET() {
  const res = await handleHealth();
  await recordRoute("health", res.status);
  return res;
}

async function handleHealth(): Promise<Response> {
  let db = false;
  let cache = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    /* db down */
  }
  try {
    cache = (await redis.ping()) === "PONG";
  } catch {
    /* cache down */
  }
  return NextResponse.json(
    { status: db && cache ? "ok" : "degraded", db, cache, time: new Date().toISOString() },
    { status: db && cache ? 200 : 503 }
  );
}
