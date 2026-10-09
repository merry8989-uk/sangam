import { getViewerId } from "@/lib/viewer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { sealPassphrase } from "@/lib/backupCrypto";

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
  skipCategories: z.array(z.enum(["NONSENSE", "INTRO", "OUTRO", "SPONSOR", "SELF_PROMO", "MUSIC", "FILLER"])).max(10).optional(),

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

  // Calls
  callRingtone: z.enum(["classic", "chime", "pulse", "silent"]).optional(),
  callVibrate: z.boolean().optional(),
  whoCanCallMe: z.enum(["EVERYONE", "FOLLOWERS", "NOBODY"]).optional(),
  callAutoAnswer: z.boolean().optional(),
  dndEnabled: z.boolean().optional(),
  dndFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  dndTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  callDefaultCamera: z.enum(["front", "back"]).optional(),
  callStartWithMic: z.boolean().optional(),
  callStartWithVideo: z.boolean().optional(),
  noiseSuppression: z.boolean().optional(),
  mirrorOwnVideo: z.boolean().optional(),
  blurBackground: z.boolean().optional(),
  virtualBackground: z.string().max(500).optional(),
  screenShareAudio: z.boolean().optional(),

  // Meetings
  joinMuted: z.boolean().optional(),
  joinVideoOff: z.boolean().optional(),
  meetingLayout: z.enum(["grid", "speaker", "sidebar"]).optional(),
  meetingMaxTiles: z.number().int().min(1).max(49).optional(),
  waitingRoom: z.boolean().optional(),
  allowGuests: z.boolean().optional(),
  meetingRecording: z.boolean().optional(),

  // Live
  liveDefaultTitle: z.string().max(120).optional(),
  liveChatEnabled: z.boolean().optional(),
  liveQaEnabled: z.boolean().optional(),
  liveAutoRecord: z.boolean().optional(),
  liveLatencyMode: z.enum(["low", "high"]).optional(),
  liveFilterChat: z.boolean().optional(),
  liveWhoCanChat: z.enum(["EVERYONE", "FOLLOWERS", "NOBODY"]).optional(),

  // Backup
  backupEnabled: z.boolean().optional(),
  backupChats: z.boolean().optional(),
  backupSearchHistory: z.boolean().optional(),
  backupWatchHistory: z.boolean().optional(),
  backupFrequency: z.enum(["daily", "weekly", "monthly", "halfyearly", "yearly"]).optional(),
  backupProvider: z.enum(["ZOHO", "GOOGLE", "TERABOX"]).optional(),
  backupFolder: z.string().max(200).optional(),
  backupEncryption: z.enum(["off", "server", "passphrase"]).optional(),
  // Write-only: we seal it and never send it back.
  backupPassphrase: z.string().min(8).max(200).optional(),

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

  // The passphrase is never stored as written - it is sealed with the server
  // key and dropped from the row we return.
  const { backupPassphrase, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (backupPassphrase !== undefined) {
    data.backupPassphraseCipher = sealPassphrase(backupPassphrase, userId);
  }

  const settings = await prisma.userSettings.update({ where: { userId }, data });
  const { backupPassphraseCipher: _omit, ...safe } = settings;
  return NextResponse.json({ settings: safe });
}
