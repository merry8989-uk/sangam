import { prisma } from "./prisma";

// Users whose posts should be hidden from the viewer: anyone they blocked or muted.
export async function hiddenUserIds(userId: string): Promise<string[]> {
  const [blocks, mutes] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.mute.findMany({ where: { muterId: userId }, select: { mutedId: true } })
  ]);
  return [...new Set([...blocks.map((b) => b.blockedId), ...mutes.map((m) => m.mutedId)])];
}

// A block in either direction stops messaging and following.
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const found = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true }
  });
  return Boolean(found);
}
