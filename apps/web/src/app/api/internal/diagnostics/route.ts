import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordRoute } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Reports users have chosen to send. Guarded by the shared internal secret, the
 * same as the other job endpoints, so it is not reachable from the browser.
 *
 *   GET /api/internal/diagnostics?limit=50      the list
 *   GET /api/internal/diagnostics?id=<id>       one report, with its body
 */
export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("internal-diagnostics", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const one = await prisma.diagnosticReport.findUnique({ where: { id } });
    if (!one) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ report: one });
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const reports = await prisma.diagnosticReport.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      userId: true,
      platform: true,
      appVersion: true,
      route: true,
      format: true,
      note: true,
      summary: true
    }
  });

  await recordRoute("internal-diagnostics", 200);
  return NextResponse.json({ reports });
}
