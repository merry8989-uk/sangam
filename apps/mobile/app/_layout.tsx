import { useEffect, useMemo, useState } from "react";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeContext } from "../src/ui";
import { colorsOf, pickTheme } from "../src/theme";
import { api, loadToken } from "../src/api";
import UpdateBanner from "../src/UpdateBanner";
import { usePathname } from "expo-router";
import {
  installAnalytics,
  loadConsent,
  setAnalyticsConsent,
  setRoute,
  startSession,
  track
} from "../src/analytics";

// LiveKit's React Native SDK needs its WebRTC globals registered before use.
// Guarded so the app still runs where the native module is absent (Expo Go).
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lk = require("@livekit/react-native");
  lk.registerGlobals?.();
} catch {
  // Native WebRTC is only present in a development or EAS build.
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState("daily");
  const [customId, setCustomId] = useState<string | undefined>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      const started = Date.now();
      await loadToken();
      try {
        const d = await api<{ settings: { themeMode?: string; themeId?: string; analyticsEnabled?: boolean } }>(
          "/api/settings"
        );
        setThemeMode(d.settings?.themeMode ?? "daily");
        setCustomId(d.settings?.themeId || undefined);
        // The server setting is the source of truth; the local flag mirrors it
        // so the gate holds before the session is known.
        await setAnalyticsConsent(d.settings?.analyticsEnabled === true);
      } catch {
        // Not signed in: fall back to the daily rotation, and analytics stays
        // off, which is the default.
        await loadConsent();
      }

      // Install the handlers before the first screen renders, so an early crash
      // is still reported.
      installAnalytics();
      await startSession({ cold: true, ms: Date.now() - started });
      setReady(true);
    })();
  }, []);

  // A screen view per route change. The pair of screens is a navigation path,
  // which is how someone gets lost.
  useEffect(() => {
    if (!ready || !pathname) return;
    setRoute(pathname);
    track("screen_view", { screen_name: pathname });
  }, [pathname, ready]);

  const theme = useMemo(() => pickTheme(themeMode, customId), [themeMode, customId]);
  const colors = useMemo(() => colorsOf(theme), [theme]);

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={colors}>
      <SafeAreaProvider>
        <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
        {/* Checks once on launch and says nothing when there is nothing to say. */}
        <UpdateBanner />
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink900,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
            tabBarActiveTintColor: colors.brand600,
            tabBarInactiveTintColor: colors.ink500
          }}
        >
          <Tabs.Screen name="index" options={{ title: "Feed" }} />
          <Tabs.Screen name="shorts" options={{ title: "Shorts" }} />
          <Tabs.Screen name="explore" options={{ title: "Explore" }} />
          <Tabs.Screen name="live" options={{ title: "Live" }} />
          <Tabs.Screen name="messages" options={{ title: "Messages" }} />
          <Tabs.Screen name="anon" options={{ title: "Anon" }} />
          <Tabs.Screen name="ai" options={{ title: "AI" }} />
          <Tabs.Screen name="settings" options={{ title: "Settings" }} />
          <Tabs.Screen name="login" options={{ href: null, title: "Sign in" }} />
          <Tabs.Screen name="post/[id]" options={{ href: null, title: "Post" }} />
          <Tabs.Screen name="room/[id]" options={{ href: null, title: "Room" }} />
          <Tabs.Screen name="drive" options={{ href: null, title: "Drive" }} />
          <Tabs.Screen name="drive/[id]" options={{ href: null, title: "Drive item" }} />
        </Tabs>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}
