import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api, hasToken, setToken } from "../src/api";
import { Button, Card, Heading, Loading, Pill, Screen, useColors } from "../src/ui";
import { pickTheme, THEME_COUNT } from "../src/theme";

export default function Settings() {
  const c = useColors();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ settings: Record<string, unknown> }>("/api/settings");
        setSettings(d.settings);
      } catch {
        // not signed in
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Screen><Loading /></Screen>;

  async function save(patch: Record<string, unknown>) {
    setSettings({ ...(settings ?? {}), ...patch });
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
    } catch {
      // not signed in: revert
      setSettings({ ...(settings ?? {}) });
    }
  }

  function Picker({
    label,
    field,
    options
  }: {
    label: string;
    field: string;
    options: string[];
  }) {
    const current = (settings?.[field] as string) ?? options[0];
    return (
      <View style={{ marginTop: 10 }}>
        <Text style={{ color: c.ink500, fontSize: 12 }}>{label}</Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {options.map((o) => (
            <Pressable key={o} onPress={() => save({ [field]: o })}>
              <Pill label={o} active={current === o} />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  const mode = (settings?.themeMode as string) ?? "daily";
  const theme = pickTheme(mode, (settings?.themeId as string) || undefined);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card>
          <Heading>Theme</Heading>
          <Text style={{ color: c.ink500, marginTop: 4, fontSize: 12 }}>
            {THEME_COUNT} combinations - rotating by day, week, month or year.
          </Text>
          <Text style={{ color: c.ink900, marginTop: 8, fontWeight: "500" }}>{theme.name}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            {["brand-600", "brand-100", "canvas", "surface", "ink-900"].map((k) => (
              <View
                key={k}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: c.line,
                  backgroundColor:
                    "#" +
                    theme.vars[k]
                      .split(" ")
                      .map((n) => Number(n).toString(16).padStart(2, "0"))
                      .join("")
                }}
              />
            ))}
          </View>
        </Card>

        <Card>
          <Heading>Quality</Heading>
          <Text style={{ color: c.ink500, marginTop: 4, fontSize: 12 }}>
            A lower setting caps the rendition the player loads, so it uses less data.
          </Text>
          <Picker label="Video quality" field="videoQuality" options={["auto", "1080", "720", "480", "360"]} />
          <Picker label="Audio quality" field="audioQuality" options={["auto", "high", "medium", "low"]} />
          <Picker label="Upload quality" field="uploadQuality" options={["original", "high", "medium", "low"]} />
        </Card>

        <Card>
          <Heading>Playback</Heading>
          <Text style={{ color: c.ink500, marginTop: 4, fontSize: 12 }}>
            Skip parts other people have marked as nonsense or filler.
          </Text>
          <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pill label={settings?.sponsorSkip ? "Skip nonsense: on" : "Skip nonsense: off"} active={Boolean(settings?.sponsorSkip)} />
            <Button
              label={settings?.sponsorSkip ? "Turn off" : "Turn on"}
              variant="ghost"
              onPress={async () => {
                const next = !settings?.sponsorSkip;
                setSettings({ ...(settings ?? {}), sponsorSkip: next });
                try {
                  await api("/api/settings", { method: "PUT", body: JSON.stringify({ sponsorSkip: next }) });
                } catch {
                  setSettings({ ...(settings ?? {}), sponsorSkip: !next });
                }
              }}
            />
          </View>
        </Card>

        <Card>
          <Heading>Account</Heading>
          {hasToken() ? (
            <View style={{ marginTop: 8, gap: 8 }}>
              <Text style={{ color: c.ink700 }}>Signed in.</Text>
              <Button label="Sign out" variant="ghost" onPress={async () => { await setToken(null); router.replace("/"); }} />
            </View>
          ) : (
            <View style={{ marginTop: 8, gap: 8 }}>
              <Text style={{ color: c.ink700 }}>You are browsing signed out.</Text>
              <Button label="Sign in" onPress={() => router.push("/login")} />
            </View>
          )}
        </Card>

        <Card>
          <Heading>About</Heading>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <Pill label="Sangam" active />
            <Pill label="v0.1.0" />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
