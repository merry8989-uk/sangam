import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import "./globals.css";
import { authOptions } from "@/lib/auth";
import { getSettingsOptional } from "@/lib/settings";
import { detectUserMood } from "@/lib/mood";
import { pickTheme } from "@/lib/themes";
import { BACKGROUND_VAR, resolveBackground } from "@/lib/background";
import Nav from "@/components/Nav";
import AiBar from "@/components/AiBar";
import ThemeProvider from "@/components/ThemeProvider";
import DiagnosticsCapture from "@/components/DiagnosticsCapture";
import AnalyticsCapture from "@/components/AnalyticsCapture";

export const metadata: Metadata = {
  title: "Sangam",
  description: "A homegrown social + video media platform, built for India."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const settings = await getSettingsOptional(userId);

  // Mood-driven theming: only computed when the user turned it on.
  let mood: string | null = null;
  if (userId && settings?.moodThemeEnabled) {
    try {
      mood = (await detectUserMood(userId)).mood;
    } catch {
      mood = null;
    }
  }

  // backgroundMode and customBackground were stored and never applied, so a
  // daily rotation or a pasted gradient changed nothing. The value is resolved
  // through a strict allowlist because it reaches a stylesheet.
  const background = resolveBackground({
    mode: settings?.backgroundMode,
    custom: settings?.customBackground
  });

  const theme = pickTheme({
    mode: settings?.themeMode ?? "daily",
    customId: settings?.themeId || undefined,
    mood
  });

  return (
    <html lang="en-IN" data-sangam-theme={theme.id} data-mode={theme.mode}>
      <body className="min-h-screen">
        <ThemeProvider
          vars={theme.vars}
          mode={theme.mode}
          id={theme.id}
          {...(background.value ? { background: background.value } : {})}
        />
        {/* Records errors locally so a report has something in it. Does nothing
            when the user has turned diagnostics off. */}
        <DiagnosticsCapture enabled={settings?.diagnosticsEnabled !== false} />
        {/* The event standard's web half: page views, web vitals, errors and the
            friction signals. Silent unless the user has agreed to analytics. */}
        <AnalyticsCapture
          releaseChannel={(process.env.APP_ENV as "production" | "beta" | "development") ?? undefined}
          consent={settings?.analyticsEnabled === true}
        />
        <Nav />
        <div className="flex">
          <div className="min-w-0 flex-1">{children}</div>
          <AiBar />
        </div>
      </body>
    </html>
  );
}
