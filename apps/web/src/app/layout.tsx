import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import "./globals.css";
import { authOptions } from "@/lib/auth";
import { getSettingsOptional } from "@/lib/settings";
import { detectUserMood } from "@/lib/mood";
import { pickTheme } from "@/lib/themes";
import Nav from "@/components/Nav";
import AiBar from "@/components/AiBar";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Sangam",
  description: "A homegrown, India-hosted social + video media platform."
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

  const theme = pickTheme({
    mode: settings?.themeMode ?? "daily",
    customId: settings?.themeId || undefined,
    mood
  });

  return (
    <html lang="en-IN" data-sangam-theme={theme.id} data-mode={theme.mode}>
      <body className="min-h-screen">
        <ThemeProvider vars={theme.vars} mode={theme.mode} id={theme.id} />
        <Nav />
        <div className="flex">
          <div className="min-w-0 flex-1">{children}</div>
          <AiBar />
        </div>
      </body>
    </html>
  );
}
