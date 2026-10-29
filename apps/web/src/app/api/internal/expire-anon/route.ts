import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordJob, recordRoute } from "@/lib/metrics";
import { logJob, logSecurity } from "@/lib/loggerServer";
import { deleteObject } from "@/lib/s3";

/**
 * Delete the anonymous chats whose time is up.
 *
 * This is the job that makes the promise true. When a temporary key was minted
 * the user was told the chat would be deleted from both sides when the clock ran
 * out - not hidden, not archived, deleted. That means:
 *
 *   the rows      gone, from the database this product runs on
 *   the files     gone, from object storage
 *   the key       gone, so it cannot open anything again
 *
 * The chat is marked EXPIRED first and deleted second, so a read that arrives in
 * between sees "expired" rather than a chat that looks alive. A read that arrives
 * after sees nothing at all.
 *
 * Run it every minute. A chat that expired forty seconds ago should be gone forty
 * seconds later, not at the next convenient hour.
 */

/** Rows deleted per sweep, so one backlog cannot hold a request open. */
const BATCH = 200;

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    await recordRoute("internal-expire-anon", 403);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  // ---- the chats ----
  const due = await prisma.anonChat.findMany({
    where: { mode: "TEMPORARY", status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, ownerId: true },
    take: BATCH
  });

  let deletedChats = 0;
  let deletedFiles = 0;
  const errors: string[] = [];

  for (const chat of due) {
    try {
      // 1. Say so first, so nothing reads a chat that should be gone as alive.
      await prisma.anonChat.update({ where: { id: chat.id }, data: { status: "EXPIRED" } });

      // 2. Take the files out of storage. A failure here must not keep the rows:
      //    an orphaned object is better than a chat that will not die.
      const attachments = await prisma.anonAttachment.findMany({
        where: { message: { chatId: chat.id } },
        select: { storageKey: true }
      });
      for (const a of attachments) {
        try {
          await deleteObject(a.storageKey);
          deletedFiles += 1;
        } catch {
          /* already gone, or storage is down - the row still goes */
        }
      }

      // 3. The chat and everything hanging off it, by cascade.
      await prisma.anonChat.delete({ where: { id: chat.id } });
      deletedChats += 1;
    } catch {
      errors.push(chat.id);
    }
  }

  // ---- the keys ----
  // A key that expired without being used, and a key whose chat is gone, both go.
  const deadKeys = await prisma.anonTempKey.deleteMany({
    where: { expiresAt: { lte: now } }
  });

  const ok = errors.length === 0;
  await recordJob("expire-anon", ok);
  logJob("expire-anon", ok, {
    chats: deletedChats,
    files: deletedFiles,
    keys: deadKeys.count,
    errors: errors.length,
    remaining: due.length === BATCH
  });

  // A chat that outlives its expiry is the one failure this feature cannot have,
  // so it is worth a security line rather than only a job line.
  if (errors.length) {
    logSecurity("anonymous chat could not be deleted", { source: "expire-anon", metadata: { errors: errors.slice(0, 10) } });
  }

  await recordRoute("internal-expire-anon", 200);
  return NextResponse.json({
    ok,
    chats: deletedChats,
    files: deletedFiles,
    keys: deadKeys.count,
    errors,
    more: due.length === BATCH
  });
}

/** What would be deleted, without deleting anything. */
export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const now = new Date();
  const [chats, keys] = await Promise.all([
    prisma.anonChat.count({ where: { mode: "TEMPORARY", status: "ACTIVE", expiresAt: { lte: now } } }),
    prisma.anonTempKey.count({ where: { expiresAt: { lte: now } } })
  ]);
  return NextResponse.json({ dueChats: chats, dueKeys: keys });
}
