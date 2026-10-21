import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import { api, hasToken } from "../src/api";
import { Button, Card, Heading, Screen, useColors } from "../src/ui";
import {
  DIAG_FORMATS,
  DIAGNOSTICS_EXCLUDES,
  DIAGNOSTICS_INCLUDES,
  buildMailto,
  buildReport,
  formatHint,
  formatLabel,
  formatReport,
  mimeType,
  reportFilename,
  fitReportInBody,
  makeSessionId,
  EMPTY_FILTER,
  filterEntries,
  filterFacets,
  filterIsActive,
  describeFilter,
  type DiagFilter,
  type DiagFormat,
  type DiagServerInfo
} from "../src/diagnostics";
import { clearEntries, deviceInfo, getEntries, installCapture } from "../src/diagnosticsDevice";

const APP_VERSION = (Constants.expoConfig?.version as string) ?? "0.1.0";

/**
 * The Android diagnostics screen. Same job as the web page: collect the
 * technical detail, write it in the chosen format, and hand it to the user's
 * mail app or share sheet with everything already filled in.
 */
export default function Diagnostics() {
  const c = useColors();
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getEntries>>>([]);
  const [server, setServer] = useState<DiagServerInfo | null>(null);
  const [supportEmail, setSupportEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [emailReady, setEmailReady] = useState(false);
  const [sessionId] = useState(() => makeSessionId());
  const [userCode, setUserCode] = useState("SG-ANON");
  const [filter, setFilter] = useState<DiagFilter>(EMPTY_FILTER);
  const [format, setFormat] = useState<DiagFormat>("md");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setEntries(await getEntries());
    try {
      const d = await api<{
        enabled: boolean;
        server: DiagServerInfo | null;
        supportEmail: string;
        emailReady: boolean;
        userCode: string;
      }>("/api/diagnostics");
      setServer(d.server ?? null);
      setSupportEmail(d.supportEmail ?? "");
      setEmailReady(Boolean(d.emailReady));
      if (d.userCode) setUserCode(d.userCode);
      setEnabled(d.enabled !== false);
    } catch {
      setServer(null);
    }
  }, []);

  useEffect(() => {
    installCapture();
    void refresh();
  }, [refresh]);

  // Everything downstream uses the filtered list, so what is sent is what is seen.
  const shown = useMemo(() => filterEntries(entries, filter), [entries, filter]);
  const facets = useMemo(() => filterFacets(entries), [entries]);
  const filtering = filterIsActive(filter);

  const report = useMemo(
    () =>
      buildReport({
        appVersion: APP_VERSION,
        signedIn: hasToken(),
        device: deviceInfo(APP_VERSION, "app/diagnostics"),
        server,
        sessionId,
        userCode,
        filter,
        entries: shown
      }),
    [server, entries, sessionId, userCode, filter, shown]
  );

  const filename = reportFilename(report, format);

  /** Write the report to a file and return its path. */
  async function writeFile(): Promise<string> {
    const path = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, formatReport(report, format), {
      encoding: FileSystem.EncodingType.UTF8
    });
    return path;
  }

  async function saveFile() {
    setBusy("save");
    setStatus(null);
    try {
      const path = await writeFile();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: mimeType(format), dialogTitle: "Save or send the report" });
        setStatus(`Report saved as ${filename}.`);
      } else {
        setStatus(`Report written to ${path}`);
      }
    } catch {
      setStatus("Could not write the report file.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(): Promise<boolean> {
    try {
      const res = await api<{ ok: boolean }>("/api/diagnostics/report", {
        method: "POST",
        body: JSON.stringify({
          note,
          platform: "android",
          appVersion: APP_VERSION,
          format,
          entries: shown,
          client: deviceInfo(APP_VERSION, "app/diagnostics")
        })
      });
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }

  /**
   * The only path that arrives with a real attachment and no user step: the
   * server sends the mail. A mailto link cannot carry a file.
   */
  async function sendWithAttachment() {
    setBusy("email");
    setStatus(null);
    try {
      const d = await api<{ ok: boolean; detail?: string }>("/api/diagnostics/email", {
        method: "POST",
        body: JSON.stringify({
          note,
          platform: "android",
          appVersion: APP_VERSION,
          format,
          sessionId,
          entries: shown,
          client: deviceInfo(APP_VERSION, "app/diagnostics")
        })
      });
      setStatus(
        d?.ok
          ? `Sent to support with ${filename} attached. Nothing else to do.`
          : `Could not send (${d?.detail ?? "the mail provider refused it"}). Use Save or share file instead.`
      );
    } catch {
      setStatus("Could not send. Use Save or share file instead.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setStatus(null);
    try {
      const path = await writeFile();
      const ok = await submit();
      // Give the file to the share sheet first, so the user has it to attach,
      // then open the mail composer with the body already written.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: mimeType(format), dialogTitle: "Attach this file to the email" });
      }
      const link = buildMailto({ to: supportEmail, report, format, filename, note });
      await Linking.openURL(link);
      setStatus(
        ok
          ? "Report sent to support. Your mail app has opened - attach the saved file and press send."
          : "Your mail app has opened - attach the saved file and press send."
      );
    } catch {
      setStatus("Could not prepare the report. Try Save file instead.");
    } finally {
      setBusy(null);
    }
  }

  async function submitOnly() {
    setBusy("submit");
    setStatus(null);
    try {
      setStatus((await submit()) ? "Report sent to support. Nothing else is needed." : "Could not send the report.");
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    await clearEntries();
    setEntries([]);
    setStatus("Recorded events cleared from this device.");
  }

  if (!enabled) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <Card>
            <Heading>Diagnostics are off</Heading>
            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 6 }}>
              Nothing is being recorded on this device. Turn it back on in Settings.
            </Text>
          </Card>
        </ScrollView>
      </Screen>
    );
  }

  const errors = entries.filter((e) => e.severity === "error").length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {status && (
          <Card>
            <Text style={{ color: c.brand700, fontSize: 12 }}>{status}</Text>
          </Card>
        )}

        <Card>
          <Heading>What will be sent</Heading>
          <Line c={c} k="Report id" v={report.id} />
          <Line c={c} k="App" v={`${APP_VERSION} (android)`} />
          <Line c={c} k="Events" v={`${entries.length} (${errors} errors)`} />
          <Line c={c} k="Your code" v={userCode} />
          {report.device && <Line c={c} k="Device" v={`${report.device.deviceName} | ${report.device.osName} ${report.device.osVersion}`} />}
          {report.server && (
            <Line c={c} k="Server" v={report.server.checks.map((k) => `${k.name}: ${k.ok ? "ok" : "failed"}`).join(", ")} />
          )}
        </Card>

        <Card>
          <Heading>Export</Heading>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 4 }}>
            Pick a format, then export. Every option above uses it, along with the filter you set
            below.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {DIAG_FORMATS.map((f) => (
              <Pressable key={f} onPress={() => setFormat(f)}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: format === f ? c.brand600 : c.line,
                    backgroundColor: format === f ? c.brand50 : c.surface,
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 10
                  }}
                >
                  <Text style={{ color: format === f ? c.brand700 : c.ink700, fontSize: 12 }}>
                    {formatLabel(f)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 6 }}>{formatHint(format)}</Text>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 2 }}>Saved as {filename}</Text>
        </Card>

        <Card>
          <Heading>What went wrong? (optional)</Heading>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="One line is enough."
            multiline
            style={{
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 8,
              padding: 8,
              marginTop: 8,
              color: c.ink900,
              minHeight: 60
            }}
          />
        </Card>

        <Card>
          <Heading>Privacy</Heading>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 6, fontWeight: "600" }}>Included</Text>
          {DIAGNOSTICS_INCLUDES.map((t) => (
            <Text key={t} style={{ color: c.ink700, fontSize: 11, marginTop: 3 }}>
              {t}
            </Text>
          ))}
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 8, fontWeight: "600" }}>
            Never included
          </Text>
          {DIAGNOSTICS_EXCLUDES.map((t) => (
            <Text key={t} style={{ color: c.ink700, fontSize: 11, marginTop: 3 }}>
              {t}
            </Text>
          ))}
        </Card>

        <Card>
          <View style={{ gap: 8 }}>
            {Boolean(supportEmail) && emailReady && (
              <Button
                label={busy === "email" ? "Sending..." : "Email it with the report attached"}
                onPress={sendWithAttachment}
                disabled={busy !== null}
              />
            )}
            {Boolean(supportEmail) && (
              <Button
                label={busy === "send" ? "Preparing..." : "Send from my mail app"}
                variant="ghost"
                onPress={send}
                disabled={busy !== null}
              />
            )}
            <Button
              label={busy === "submit" ? "Sending..." : "Send without email"}
              variant="ghost"
              onPress={submitOnly}
              disabled={busy !== null}
            />
            <Button
              label={busy === "save" ? "Exporting..." : `Export ${format.toUpperCase()}`}
              variant="ghost"
              onPress={saveFile}
              disabled={busy !== null}
            />
            <Button label="Refresh" variant="ghost" onPress={refresh} disabled={busy !== null} />
            <Button label="Clear recorded events" variant="ghost" onPress={clear} disabled={busy !== null} />
          </View>
          {!supportEmail && (
            <Text style={{ color: c.ink500, fontSize: 11, marginTop: 8 }}>
              No support address is configured on the server, so the email options are hidden. Use
              Save or share file.
            </Text>
          )}
          {Boolean(supportEmail) && !emailReady && (
            <Text style={{ color: c.ink500, fontSize: 11, marginTop: 8 }}>
              A mail provider is not configured on the server, so the report cannot be sent with the
              attachment automatically. Use Save or share file - picking Gmail in the share sheet
              attaches it for you.
            </Text>
          )}
        </Card>

        <Card>
          <Heading>Your code</Heading>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 6 }}>
            A short label for your account. Support sees this instead of your name or email address.
          </Text>
          <Text style={{ color: c.ink900, fontSize: 18, fontFamily: "monospace", marginTop: 8, letterSpacing: 1 }}>
            {userCode}
          </Text>
        </Card>

        <Card>
          <Heading>Filter</Heading>
          {filtering && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Text style={{ color: c.ink500, fontSize: 11, flex: 1 }}>
                {shown.length} of {entries.length} · {describeFilter(filter)}
              </Text>
              <Pressable onPress={() => setFilter(EMPTY_FILTER)}>
                <Text style={{ color: c.brand700, fontSize: 11 }}>Clear</Text>
              </Pressable>
            </View>
          )}
          {([
            ["Severity", "severities", facets.severities],
            ["Kind", "kinds", facets.kinds],
            ["Outcome", "outcomes", facets.outcomes]
          ] as const).map(([label, key, options]) =>
            options.length === 0 ? null : (
              <View key={label} style={{ marginTop: 10 }}>
                <Text style={{ color: c.ink500, fontSize: 11, marginBottom: 4 }}>{label}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {options.map((o: string) => {
                    const on = (filter[key] ?? []).includes(o as never);
                    return (
                      <Pressable
                        key={o}
                        onPress={() =>
                          setFilter((f) => {
                            const cur = (f[key] ?? []) as string[];
                            const next = cur.includes(o) ? cur.filter((v) => v !== o) : [...cur, o];
                            return { ...f, [key]: next.length ? next : undefined } as DiagFilter;
                          })
                        }
                      >
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: on ? c.brand600 : c.line,
                            backgroundColor: on ? c.brand50 : c.surface,
                            borderRadius: 8,
                            paddingVertical: 4,
                            paddingHorizontal: 8
                          }}
                        >
                          <Text style={{ color: on ? c.brand700 : c.ink700, fontSize: 11 }}>{o}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )
          )}
          <TextInput
            value={filter.text ?? ""}
            onChangeText={(v) => setFilter((f) => ({ ...f, text: v || undefined }))}
            placeholder="Search the messages"
            style={{
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 8,
              padding: 8,
              marginTop: 10,
              color: c.ink900
            }}
          />
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 6 }}>
            The export and the email use this filter too.
          </Text>
        </Card>

        <Card>
          <Heading>
            Recorded events {filtering ? `${shown.length} of ${entries.length}` : `(${entries.length})`}
          </Heading>
          {shown.length === 0 ? (
            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 6 }}>
              {filtering
                ? "No events match this filter."
                : "Nothing recorded yet. That is normal if nothing has gone wrong."}
            </Text>
          ) : (
            shown
              .slice()
              .reverse()
              .slice(0, 50)
              .map((e, i) => (
                <Text key={i} style={{ color: c.ink900, fontSize: 11, marginTop: 4 }}>
                  <Text style={{ color: e.severity === "error" ? "#dc2626" : c.ink500 }}>
                    {e.severity} {e.kind}{" "}
                  </Text>
                  {e.message}
                </Text>
              ))
          )}
        </Card>

        <View style={{ height: 20 }} />
      </ScrollView>
    </Screen>
  );
}

function Line({ c, k, v }: { c: ReturnType<typeof useColors>; k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
      <Text style={{ color: c.ink500, fontSize: 12, width: 80 }}>{k}</Text>
      <Text style={{ color: c.ink900, fontSize: 12, flex: 1 }}>{v}</Text>
    </View>
  );
}
