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

/** Cross-promotion list. Never contains Sangam itself. */
const EXPLORE_APPS = [
  { name: "Chronos", tagline: "Exact alarms with holiday skipping, world clock, timer presets, lap stopwatch", url: "https://github.com/merry8989-uk/chronos-clock/releases/latest/download/app-release.apk", label: "Download APK" },
  { name: "Universal AI Calculator", tagline: "Standard, scientific, unit converter, programmer, date tools + 47 calculators", url: "https://github.com/merry8989-uk/universal-ai-calculator/releases/latest/download/app-release.apk", label: "Download APK" },
  { name: "ProGallery", tagline: "Full-featured gallery: MediaStore indexing, duplicate detection, photo/video editing", url: "https://github.com/merry8989-uk/pro-gallery-android/releases/download/v1.60.0/pro-gallery-debug.apk", label: "Download APK" },
  { name: "Kavach", tagline: "Indian-first AI caller ID, smart blocking, call recording, AI call assistant", url: "https://github.com/merry8989-uk/kavach/releases/download/v1.1.0/kavach-1.1.0.apk", label: "Download APK" },
  { name: "Low Distraction Launcher", tagline: "Minimal text-only launcher, no icons, no feeds, no internet access", url: "https://github.com/merry8989-uk/lowdistraction-launcher/releases/download/v1.39/lowdistraction-v1.39.apk", label: "Download APK" },
  { name: "FloatScript", tagline: "Transparent floating teleprompter for Android", url: "https://github.com/merry8989-uk/floatscript/releases/download/v1.3.0/FloatScript-v1.3.0.apk", label: "Download APK" },
  { name: "Camara", tagline: "Camera + editor: filters, stickers, beauty tools, teleprompter, image & video editing", url: "https://github.com/merry8989-uk/camara-app/releases/download/1.11.0/camara-1.11.0.apk", label: "Download APK" },
  { name: "Powerbase", tagline: "Self-hosted diagnostics client: dashboards, log explorer, crash groups, devices, alerts", url: "https://github.com/merry8989-uk/powerbase-app/releases/latest/download/app-release.apk", label: "Download APK" },
  { name: "Local AI Keyboard", tagline: "Offline privacy-first keyboard with on-device LLM for writing and corrections", url: "https://github.com/merry8989-uk/local-ai-keyboard", label: "View repo" },
  { name: "Arrow Puzzle Advanced", tagline: "12,000 guaranteed-solvable arrow puzzles (6,000 Classic + 6,000 Escape)", url: "https://github.com/merry8989-uk/arrow-puzzle-advanced/releases/download/v5.11/ArrowPuzzleAdvanced-5.11.apk", label: "Download APK" },
  { name: "New Arrow Puzzle", tagline: "Offline HTML5 arrow-clearing game, 12,000 verified levels, hard mode from 25", url: "https://merry8989-uk.github.io/new-arrow-puzzle/", label: "Open" },
  { name: "PDF Toolkit", tagline: "Merge, split, rotate, watermark, convert, protect PDFs in the browser. No uploads", url: "https://github.com/merry8989-uk/pdf-toolkit/releases/latest/download/pdf-toolkit-1.1.0.apk", label: "Download APK" },
  { name: "Doc Viewer & Editor", tagline: "Open, edit, convert, compress, merge docs, images, sheets, PDFs, ebooks", url: "https://merry8989-uk.github.io/doc-viewer-editor/", label: "Open" },
  { name: "Dhoondh", tagline: "Multi-tab search engine: AI, images, videos, papers, books, PDF, Drive, Archive", url: "https://merry8989-uk.github.io/dhoondh/", label: "Open" },
  { name: "Pulse", tagline: "Social feed for text, photos and video. Single-file static site", url: "https://merry8989-uk.github.io/pulse-feed/", label: "Open" },
  { name: "KaamSetu", tagline: "Job vacancy portal with employer posting and admin moderation", url: "https://merry8989-uk.github.io/kaamsetu-job-portal/", label: "Open" },
  { name: "48 Laws of Power", tagline: "Hindi notes, mindmap, examples and usage for the 48 laws", url: "https://merry8989-uk.github.io/48-laws-of-power/", label: "Open" },
  { name: "On This Day", tagline: "Daily bilingual Hindi + English history briefing, static site", url: "https://merry8989-uk.github.io/on-this-day/", label: "Open" },
  { name: "USB Screen Mirror", tagline: "Low-latency Android-to-Windows USB mirroring, scrcpy wrapper with GUI", url: "https://github.com/merry8989-uk/usb-screen-mirror/releases/latest/download/PhoneMirrorServer.apk", label: "Download APK" },
  { name: "Powerbase Server", tagline: "Self-hosted observability: log ingestion, explorer, traces, metrics, alerting", url: "https://github.com/merry8989-uk/powerbase-server", label: "View repo" },
];



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
            diagnosticsEnabled: settings.diagnosticsEnabled,
            hideSensitive: settings.hideSensitive,
            blockedWords: (settings.blockedWords as string[]) ?? []
          }}
          currentTheme={{ name: currentTheme.name, vars: currentTheme.vars }}
        />
        <section>
          <h2 className="mb-1 text-lg font-semibold">Explore more apps by us</h2>
          <p className="mb-4 text-sm opacity-70">Other apps we build. Free, no ads, no accounts.</p>
          <ul className="space-y-3">
            {EXPLORE_APPS.map((app) => (
              <li key={app.name} className="rounded-2xl border border-white/10 p-3">
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{app.name}</span>
                    <span className="block text-xs opacity-70">{app.tagline}</span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                    {app.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
