import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewerId } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import type { HistoryType } from "@/lib/history";

/**
 * One history row.
 *
 *   PATCH ?type=watch|search   { archived: true | false }   archive or restore
 *   DELETE ?type=watch|search                               remove for good
 *
 * Every query is scoped by userId as well as id, so one user can never touch
 * another's row even with a guessed id.
 */
const Body = z.object({ archived: z.boolean() });

function parseType(v: string | null): HistoryType | null {
  if (v === "search") return "search";
  if (v === "watch") return "watch";
  return null;
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = parseType(new URL(req.url).searchParams.get("type"));
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const archivedAt = parsed.data.archived ? new Date() : null;

  const where = { id: ctx.params.id, userId };
  const result =
    type === "search"
      ? await prisma.searchHistory.updateMany({ where, data: { archivedAt } })
      : await prisma.viewHistory.updateMany({ where, data: { archivedAt } });

  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, archived: parsed.data.archived });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = parseType(new URL(req.url).searchParams.get("type"));
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  const where = { id: ctx.params.id, userId };
  const result =
    type === "search"
      ? await prisma.searchHistory.deleteMany({ where })
      : await prisma.viewHistory.deleteMany({ where });

  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
