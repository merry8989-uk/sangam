import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getViewerId } from "@/lib/viewer";
import { loadItemWithAccess } from "@/lib/driveAccess";
import { canManage, expiresAtFromDays, newShareToken } from "@/lib/drive-share";
import { PUBLIC_USER_SELECT } from "@/lib/select";
import { withLogging } from "@/lib/withLogging";

/**
 * Sharing one drive item.
 *
 *   GET   the shares on this item
 *   POST  add a share - either with a person, or as a public link
 *
 * Both clients called this path before it existed: the web ShareDialog and the
 * Android drive screen. Every call 404'd, and both swallow the failure, so the
 * symptom was a share list that was always empty and a Share button that always
 * said it had failed. The revoke path (`/api/drive/shares/[id]`) did exist,
 * which is what made the gap easy to miss.
 */

// A share is either named (a person) or public (a link), never both.
const Body = z
  .object({
    username: z.string().min(1).max(60).optional(),
    public: z.boolean().optional(),
    role: z.enum(["VIEWER", "EDITOR"]).optional(),
    expiresInDays: z.number().int().min(1).max(3650).optional()
  })
  .refine((v) => Boolean(v.username) !== Boolean(v.public), {
    message: "Give either a username or public: true, not both"
  });

/** Only the owner, or someone with manage rights, may see or change sharing. */
async function loadManageable(userId: string, itemId: string) {
  const access = await loadItemWithAccess(userId, itemId);
  if (!access) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!canManage(access.level)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { item: access.item };
}

export const GET = withLogging("drive:id:share:get", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loaded = await loadManageable(userId, params.id);
  if (loaded.error) return loaded.error;

  const shares = await prisma.driveShare.findMany({
    where: { itemId: params.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      token: true,
      expiresAt: true,
      createdAt: true,
      sharedWithId: true,
      // A named share carries the person, but only the columns anyone may see.
      sharedWith: { select: PUBLIC_USER_SELECT }
    }
  });

  return NextResponse.json({ shares });
});

export const POST = withLogging("drive:id:share:post", async (req: Request, { params }: { params: { id: string } }) => {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const loaded = await loadManageable(userId, params.id);
  if (loaded.error) return loaded.error;

  const role = data.role ?? "VIEWER";
  const expiresAt = expiresAtFromDays(data.expiresInDays, new Date());

  if (data.public) {
    const share = await prisma.driveShare.create({
      data: { itemId: params.id, ownerId: userId, role, token: newShareToken(), expiresAt },
      select: { id: true, role: true, token: true, expiresAt: true, createdAt: true }
    });
    return NextResponse.json({ share });
  }

  // A named share. Resolve the username, and do not say whether an account
  // exists when it does not - a share dialog should not be a directory.
  const target = await prisma.user.findUnique({
    where: { username: data.username! },
    select: { id: true }
  });
  if (!target) return NextResponse.json({ error: "No such user" }, { status: 404 });
  if (target.id === userId) {
    return NextResponse.json({ error: "You already own this item" }, { status: 400 });
  }

  // One share per person per item - the schema has a unique index, so an
  // existing share is updated rather than duplicated.
  const share = await prisma.driveShare.upsert({
    where: { itemId_sharedWithId: { itemId: params.id, sharedWithId: target.id } },
    create: { itemId: params.id, ownerId: userId, sharedWithId: target.id, role, expiresAt },
    update: { role, expiresAt },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      sharedWithId: true,
      sharedWith: { select: PUBLIC_USER_SELECT }
    }
  });

  return NextResponse.json({ share });
});
