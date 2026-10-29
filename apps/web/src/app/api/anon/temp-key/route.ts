import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { withLogging } from "@/lib/withLogging";
import { logAudit } from "@/lib/loggerServer";
import { expiresAtFrom, newTempKey, parseDuration, MIN_TEMP_SECONDS, TEMP_PRESETS } from "@/lib/anon";

/**
 * Mint a temporary key.
 *
 * The user chooses how long it lives - ten seconds at the least, up to thirty
 * days. When it expires the key is destroyed and the chat it opened is deleted
 * from both sides, here and in storage.
 *
 * A key is bound to the first chat it opens and joins that chat on every later
 * use, which is how a temporary *group* forms: one key, several people.
 */

const Body = z.object({
  // Seconds, or a string like "2h". The picker sends seconds.
  duration: z.union([z.number(), z.string()])
});

export const GET = withLogging("anon:temp-key:options", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const live = await prisma.anonTempKey.findMany({
    where: { ownerId: userId, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, key: true, durationSec: true, expiresAt: true }
  });

  return NextResponse.json({ presets: TEMP_PRESETS, minSeconds: MIN_TEMP_SECONDS, unused: live });
});

export const POST = withLogging("anon:temp-key", async (req: Request) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const duration = parseDuration(parsed.data.duration);
  if (!duration.ok) {
    return NextResponse.json(
      {
        error:
          duration.reason === "too short"
            ? `A temporary chat must last at least ${MIN_TEMP_SECONDS} seconds.`
            : duration.reason === "too long"
              ? "That is longer than thirty days. Use your fixed key for a chat that should last."
              : "That is not a duration."
      },
      { status: 400 }
    );
  }

  const key = await prisma.anonTempKey.create({
    data: {
      key: newTempKey(),
      ownerId: userId,
      durationSec: duration.seconds,
      expiresAt: expiresAtFrom(duration.seconds)
    },
    select: { id: true, key: true, durationSec: true, expiresAt: true }
  });

  logAudit({ userId, action: "mint", resource: "anon_temp_key", metadata: { durationSec: duration.seconds } });
  return NextResponse.json({ key }, { status: 201 });
});
