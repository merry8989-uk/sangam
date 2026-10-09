import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { api, backupStatus, googleConnectUrl, hasToken, runBackupNow, setToken, zohoConnectUrl, type BackupStatus } from "../src/api";
import { Button, Card, Heading, Loading, Pill, Screen, useColors } from "../src/ui";
import { pickTheme, THEME_COUNT } from "../src/theme";

export default function Settings() {
  const c = useColors();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [backupNote, setBackupNote] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ settings: Record<string, unknown> }>("/api/settings");
        setSettings(d.settings);
      } catch {
        // not signed in
      }
      try {
        setBackup(await backupStatus());
      } catch {
        // signed out
      }
      setLoading(false);
    })();
  }, []);

  async function saveBackup(patch: Record<string, unknown>) {
    setBackup((b) => (b ? { ...b, ...patch } as BackupStatus : b));
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
      setBackup(await backupStatus());
    } catch {
      setBackupNote("Could not save that.");
    }
  }

  async function backUpNow() {
    setBackupBusy("run");
    setBackupNote(null);
    try {
      await runBackupNow();
      setBackupNote("Backup finished.");
      setBackup(await backupStatus());
    } catch {
      setBackupNote("The backup failed.");
    }
    setBackupBusy(null);
  }

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

  function Toggle({ label, field }: { label: string; field: string }) {
    const on = Boolean(settings?.[field]);
    return (
      <Pressable onPress={() => save({ [field]: !on })} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pill label={on ? "on" : "off"} active={on} />
        <Text style={{ color: c.ink700, fontSize: 13, flex: 1 }}>{label}</Text>
      </Pressable>
    );
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
          <Heading>Calls</Heading>
          <Picker label="Who can call me" field="whoCanCallMe" options={["EVERYONE", "FOLLOWERS", "NOBODY"]} />
          <Picker label="Ringtone" field="callRingtone" options={["classic", "chime", "pulse", "silent"]} />
          <Picker label="Default camera" field="callDefaultCamera" options={["front", "back"]} />
          <Toggle label="Vibrate on incoming call" field="callVibrate" />
          <Toggle label="Do not disturb" field="dndEnabled" />
          <Toggle label="Start calls with my microphone on" field="callStartWithMic" />
          <Toggle label="Start calls with my camera on" field="callStartWithVideo" />
          <Toggle label="Noise suppression" field="noiseSuppression" />
          <Toggle label="Mirror my own video" field="mirrorOwnVideo" />
          <Toggle label="Blur my background" field="blurBackground" />
          <Toggle label="Share system audio when screen sharing" field="screenShareAudio" />
        </Card>

        <Card>
          <Heading>Meetings</Heading>
          <Picker label="Default layout" field="meetingLayout" options={["grid", "speaker", "sidebar"]} />
          <Toggle label="Join muted" field="joinMuted" />
          <Toggle label="Join with camera off" field="joinVideoOff" />
          <Toggle label="Waiting room" field="waitingRoom" />
          <Toggle label="Allow guests without an account" field="allowGuests" />
          <Toggle label="Record my meetings by default" field="meetingRecording" />
        </Card>

        <Card>
          <Heading>Live</Heading>
          <Picker label="Latency mode" field="liveLatencyMode" options={["low", "high"]} />
          <Picker label="Who can chat" field="liveWhoCanChat" options={["EVERYONE", "FOLLOWERS", "NOBODY"]} />
          <Toggle label="Live chat" field="liveChatEnabled" />
          <Toggle label="Filter chat through the word filter" field="liveFilterChat" />
          <Toggle label="Q and A panel" field="liveQaEnabled" />
          <Toggle label="Record my streams by default" field="liveAutoRecord" />
        </Card>

        {backup ? (
          <Card>
            <Heading>Backup</Heading>
            <Text style={{ color: c.ink500, marginTop: 4, fontSize: 12 }}>
              Keep your chats, searches and watch history in your own cloud account.
            </Text>

            <Pressable onPress={() => saveBackup({ backupEnabled: !backup.enabled })} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pill label={backup.enabled ? "on" : "off"} active={backup.enabled} />
              <Text style={{ color: c.ink700, fontSize: 13, flex: 1 }}>Back up my data</Text>
            </Pressable>

            <Toggle label="Chat backup" field="backupChats" />
            <Toggle label="Search history backup" field="backupSearchHistory" />
            <Toggle label="Watch history backup" field="backupWatchHistory" />

            <Picker label="How often" field="backupFrequency" options={["daily", "weekly", "monthly", "halfyearly", "yearly"]} />
            <Picker label="Where to keep it" field="backupProvider" options={["ZOHO", "GOOGLE", "TERABOX"]} />
            <Picker label="Encrypt the backup" field="backupEncryption" options={["off", "server", "passphrase"]} />

            {backup.encryption === "passphrase" ? (
              <View style={{ marginTop: 10, borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "#fffbeb", borderRadius: 8, padding: 10 }}>
                <Text style={{ color: "#78350f", fontSize: 11 }}>
                  The file is locked with your passphrase, so it is useless to anyone who finds it. But scheduled
                  backups run while you are away, so we keep the passphrase encrypted on our side - this protects the
                  backup in your Drive, it is not zero-knowledge. Forget it and the backup cannot be opened.
                </Text>
                <TextInput
                  secureTextEntry
                  style={{ borderColor: "#fcd34d", borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8, color: c.ink900 }}
                  placeholder={backup.hasPassphrase ? "Passphrase saved - type a new one" : "Choose a passphrase (8+ characters)"}
                  placeholderTextColor={c.ink500}
                  value={passphrase}
                  onChangeText={setPassphrase}
                />
                <View style={{ marginTop: 8 }}>
                  <Button
                    label="Save passphrase"
                    onPress={() => {
                      if (passphrase.length < 8) { setBackupNote("A passphrase needs at least 8 characters."); return; }
                      saveBackup({ backupPassphrase: passphrase });
                      setPassphrase("");
                      setBackupNote("Passphrase saved.");
                    }}
                    disabled={passphrase.length < 8}
                  />
                </View>
                {!backup.hasPassphrase ? (
                  <Text style={{ color: "#dc2626", fontSize: 11, marginTop: 6 }}>
                    No passphrase saved yet - backups will fail until you set one.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {backup.provider === "TERABOX" ? (
              <Text style={{ color: "#b45309", fontSize: 11, marginTop: 8 }}>
                Terabox cannot receive files - there is no supported way to write one. Pick Zoho or Google.
              </Text>
            ) : null}

            {backup.provider !== "TERABOX" &&
            ((backup.provider === "ZOHO" && !backup.connected.zoho) || (backup.provider === "GOOGLE" && !backup.connected.google)) ? (
              <View style={{ marginTop: 10 }}>
                <Button
                  label={backup.provider === "ZOHO" ? "Connect Zoho WorkDrive" : "Connect Google Drive"}
                  onPress={() => Linking.openURL(backup.provider === "ZOHO" ? zohoConnectUrl() : googleConnectUrl())}
                />
              </View>
            ) : null}

            <View style={{ marginTop: 10 }}>
              <Button
                label={backupBusy === "run" ? "Backing up..." : "Back up now"}
                onPress={backUpNow}
                disabled={backupBusy !== null || backup.provider === "TERABOX"}
              />
            </View>

            <Text style={{ color: c.ink500, fontSize: 11, marginTop: 8 }}>
              {backup.lastBackupAt
                ? `Last backup ${new Date(backup.lastBackupAt).toLocaleString("en-IN")}`
                : "No backup has run yet."}
            </Text>
            {backupNote ? <Text style={{ color: c.brand700, fontSize: 12, marginTop: 6 }}>{backupNote}</Text> : null}

            {backup.runs.length > 0 ? (
              <View style={{ marginTop: 10, gap: 4 }}>
                {backup.runs.slice(0, 5).map((r) => (
                  <Text key={r.id} style={{ color: r.status === "FAILED" ? "#dc2626" : c.ink700, fontSize: 11 }}>
                    {r.status} - {r.provider} {r.period} - {new Date(r.startedAt).toLocaleDateString("en-IN")}
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <Heading>Notes &amp; Drive</Heading>
          <Text style={{ color: c.ink500, marginTop: 4, fontSize: 12 }}>
            Your own space for notes, documents, sheets, slides and any file.
          </Text>
          <View style={{ marginTop: 10 }}>
            <Button label="Open My Drive" onPress={() => router.push("/drive")} />
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
