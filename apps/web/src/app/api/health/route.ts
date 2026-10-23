import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { recordRoute } from "@/lib/metrics";
import { describeStorage } from "@/lib/storage";
import { storage } from "@/lib/s3";
import { withLogging } from "@/lib/withLogging";

// Liveness / readiness probe: reports database and cache connectivity.
export const GET = withLogging("health:get", async (req: Request) => {
  const res = await handleHealth();
  await recordRoute("health", res.status);
  return res;
});

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
    {
      status: db && cache ? "ok" : "degraded",
      db,
      cache,
      // Where the media actually lives. An operator reading this should be able
      // to tell whether the deployment's hosting claim holds for storage, which
      // is the part a CDN in front of it does not change.
      storage: { backend: storage.backend, region: storage.region, inIndia: !storage.leavesIndia, summary: describeStorage(storage) },
      time: new Date().toISOString()
    },
    { status: db && cache ? 200 : 503 }
  );
}
