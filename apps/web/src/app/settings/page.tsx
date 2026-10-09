import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import ProfileSettings from "@/components/ProfileSettings";
import SettingsPanel from "@/components/SettingsPanel";
import { detectUserMood } from "@/lib/mood";
import { pickTheme } from "@/lib/themes";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, displayName: true, bio: true, avatarUrl: true, coverUrl: true }
    }),
    getSettings(userId)
  ]);
  if (!user) redirect("/login");

  let mood: string | null = null;
  if (settings.moodThemeEnabled) {
    try {
      mood = (await detectUserMood(userId)).mood;
    } catch {
      mood = null;
    }
  }
  const currentTheme = pickTheme({
    mode: settings.themeMode,
    customId: settings.themeId || undefined,
    mood
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="space-y-8">
        <ProfileSettings initial={user} />
        <SettingsPanel
          initial={{
            theme: settings.theme,
            accent: settings.accent,
            dailyBackground: settings.dailyBackground,
            backgroundMode: settings.backgroundMode,
            customBackground: settings.customBackground,
            chatBackground: settings.chatBackground,
            themeMode: settings.themeMode,
            themeId: settings.themeId,
            moodThemeEnabled: settings.moodThemeEnabled,
            videoQuality: settings.videoQuality,
            audioQuality: settings.audioQuality,
            uploadQuality: settings.uploadQuality,
            autoplay: settings.autoplay,
            playbackSpeed: settings.playbackSpeed,
            captionsDefault: settings.captionsDefault,
            pipEnabled: settings.pipEnabled,
            backgroundPlay: settings.backgroundPlay,
            sponsorSkip: settings.sponsorSkip,
            defaultVisibility: settings.defaultVisibility,
            allowDownloads: settings.allowDownloads,
            recommendedContent: settings.recommendedContent,
            interests: (settings.interests as string[]) ?? [],
            nonInterests: (settings.nonInterests as string[]) ?? [],
            threadedComments: settings.threadedComments,
            commentSort: settings.commentSort,
            whoCanComment: settings.whoCanComment,
            whoCanShare: settings.whoCanShare,
            whoCanReshare: settings.whoCanReshare,
            profileVisible: settings.profileVisible,
            whoCanViewPosts: settings.whoCanViewPosts,
            autoSaveDrafts: settings.autoSaveDrafts,
            historyEnabled: settings.historyEnabled,
            autoDeleteDays: settings.autoDeleteDays,
            hideSensitive: settings.hideSensitive,
            blockedWords: (settings.blockedWords as string[]) ?? []
          }}
          currentTheme={{ name: currentTheme.name, vars: currentTheme.vars }}
        />
      </div>
    </main>
  );
}
