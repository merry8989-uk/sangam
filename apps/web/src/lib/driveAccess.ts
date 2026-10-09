import { prisma } from "./prisma";
import { resolveAccess, bestShareLevel, type AccessLevel } from "./drive-share";

export type AccessResult = {
  item: {
    id: string;
    ownerId: string;
    parentId: string | null;
    kind: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string | null;
    content: string;
    sourceUrl: string | null;
    starred: boolean;
    trashedAt: Date | null;
    updatedAt: Date;
  };
  level: AccessLevel;
  // The share that granted access, if it was not the owner.
  via: { id: string; role: string; itemId: string } | null;
};

// A share on a folder covers everything inside it, so the check walks up the
// parent chain. The best role found anywhere on the chain wins.
export async function loadItemWithAccess(userId: string, itemId: string): Promise<AccessResult | null> {
  const item = await prisma.driveItem.findUnique({ where: { id: itemId } });
  if (!item) return null;

  if (item.ownerId === userId) {
    return { item, level: "OWNER", via: null };
  }

  const chain: string[] = [];
  let cursor: string | null = item.id;
  for (let i = 0; i < 50 && cursor; i++) {
    chain.push(cursor);
    const row: { parentId: string | null } | null = await prisma.driveItem.findUnique({
      where: { id: cursor },
      select: { parentId: true }
    });
    cursor = row?.parentId ?? null;
  }

  const shares = await prisma.driveShare.findMany({
    where: { sharedWithId: userId, itemId: { in: chain } }
  });

  const best = bestShareLevel(shares);
  if (!best) return { item, level: "NONE", via: null };

  return { item, level: best.level, via: { id: best.share.id, role: best.share.role, itemId: best.share.itemId } };
}

// Opening a link share: anyone holding the token, no account needed.
export async function loadByShareToken(token: string) {
  const share = await prisma.driveShare.findUnique({ where: { token } });
  if (!share || !share.token) return null;

  const level = resolveAccess({ isOwner: false, share });
  if (level === "NONE") return null;

  const item = await prisma.driveItem.findUnique({ where: { id: share.itemId } });
  if (!item || item.trashedAt) return null;

  return { share, item, level };
}

// Everything shared with this user, most recent first, for the "Shared with me" list.
export async function listSharedWithMe(userId: string) {
  const shares = await prisma.driveShare.findMany({
    where: { sharedWithId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      item: { select: { id: true, name: true, kind: true, mimeType: true, sizeBytes: true, updatedAt: true, trashedAt: true } }
    }
  });

  return shares
    .filter((s) => resolveAccess({ isOwner: false, share: s }) !== "NONE" && !s.item.trashedAt)
    .map((s) => ({
      shareId: s.id,
      role: s.role,
      item: s.item
    }));
}
