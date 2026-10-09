import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

const Body = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  accent: z.string().max(20).optional(),
  dailyBackground: z.boolean().optional(),
  backgroundMode: z.enum(["static", "weekly", "daily", "custom"]).optional(),
  customBackground: z.string().max(500).optional(),
  chatBackground: z.string().max(500).optional(),
  themeMode: z.enum(["daily", "weekly", "monthly", "yearly", "mood", "custom"]).optional(),
  themeId: z.string().max(80).optional(),
  moodThemeEnabled: z.boolean().optional(),

  videoQuality: z.enum(["auto", "1080", "720", "480", "360"]).optional(),
  audioQuality: z.enum(["auto", "high", "medium", "low"]).optional(),
  uploadQuality: z.enum(["original", "high", "medium", "low"]).optional(),
  autoplay: z.boolean().optional(),
  playbackSpeed: z.number().min(0.25).max(3).optional(),
  captionsDefault: z.boolean().optional(),
  pipEnabled: z.boolean().optional(),
  backgroundPlay: z.boolean().optional(),
  sponsorSkip: z.boolean().optional(),

  defaultVisibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),
  allowDownloads: z.boolean().optional(),

  recommendedContent: z.boolean().optional(),
  interests: z.array(z.string().max(40)).max(50).optional(),
  nonInterests: z.array(z.string().max(40)).max(50).optional(),

  threadedComments: z.boolean().optional(),
  commentSort: z.enum(["top", "new", "old"]).optional(),

  whoCanComment: z.enum(["EVERYONE", "FOLLOWERS", "NOBODY"]).optional(),
  whoCanShare: z.enum(["EVERYONE", "FOLLOWERS", "NOBODY"]).optional(),
  whoCanReshare: z.enum(["EVERYONE", "FOLLOWERS", "NOBODY"]).optional(),
  profileVisible: z.boolean().optional(),
  whoCanViewPosts: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),

  autoSaveDrafts: z.boolean().optional(),

  historyEnabled: z.boolean().optional(),
  autoDeleteDays: z.number().int().min(0).max(3650).optional(),

  hideSensitive: z.boolean().optional(),
  blockedWords: z.array(z.string().max(60)).max(200).optional()
});

export async function GET(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ settings: await getSettings(userId) });
}

export async function PUT(req: Request) {
  const userId = await getViewerId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await getSettings(userId);
  const settings = await prisma.userSettings.update({ where: { userId }, data: parsed.data });
  return NextResponse.json({ settings });
}
