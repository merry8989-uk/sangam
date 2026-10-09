import type { UserSettings } from "@prisma/client";
import { prisma } from "./prisma";

// One settings row per user, created on first read with the schema defaults.
export async function getSettings(userId: string): Promise<UserSettings> {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
}

export async function getSettingsOptional(userId: string | undefined | null) {
  if (!userId) return null;
  try {
    return await getSettings(userId);
  } catch {
    return null;
  }
}
