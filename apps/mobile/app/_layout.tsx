import { useEffect, useMemo, useState } from "react";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeContext } from "../src/ui";
import { colorsOf, pickTheme } from "../src/theme";
import { api, loadToken } from "../src/api";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState("daily");
  const [customId, setCustomId] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      await loadToken();
      try {
        const d = await api<{ settings: { themeMode?: string; themeId?: string } }>("/api/settings");
        setThemeMode(d.settings?.themeMode ?? "daily");
        setCustomId(d.settings?.themeId || undefined);
      } catch {
        // Not signed in: fall back to the daily rotation.
      }
      setReady(true);
    })();
  }, []);

  const theme = useMemo(() => pickTheme(themeMode, customId), [themeMode, customId]);
  const colors = useMemo(() => colorsOf(theme), [theme]);

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={colors}>
      <SafeAreaProvider>
        <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
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
          <Tabs.Screen name="messages" options={{ title: "Messages" }} />
          <Tabs.Screen name="ai" options={{ title: "AI" }} />
          <Tabs.Screen name="settings" options={{ title: "Settings" }} />
          <Tabs.Screen name="login" options={{ href: null, title: "Sign in" }} />
          <Tabs.Screen name="post/[id]" options={{ href: null, title: "Post" }} />
        </Tabs>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}
