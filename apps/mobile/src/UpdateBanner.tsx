import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useColors } from "./ui";
import {
  checkForUpdate,
  currentVersion,
  downloadUpdate,
  formatBytes,
  installUpdate,
  type UpdateState
} from "./updater";

/**
 * The in-built updater.
 *
 * Checks once on launch, and says nothing at all when there is nothing to say.
 * When there is a new build it shows the version, the notes and a button; the
 * download then draws a real progress bar, from the bytes actually written.
 *
 * The install is always the user's press, and always Android's own prompt. An
 * app that replaces itself without being asked is a thing people are right to
 * be wary of.
 */
export default function UpdateBanner() {
  const c = useColors();
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setState({ phase: "checking" });
      const s = await checkForUpdate();
      if (alive) setState(s);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (state.phase !== "available") return;
    const info = state.info;
    try {
      setState({ phase: "downloading", progress: 0, received: 0, total: info.sizeBytes ?? 0 });
      const uri = await downloadUpdate(info, (fraction, received, total) => {
        setState({ phase: "downloading", progress: fraction, received, total });
      });
      setState({ phase: "installing" });
      await installUpdate(uri);
      setState({ phase: "idle" });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Update failed." });
    }
  }, [state]);

  // Nothing to say, or the user put it away.
  if (dismissed) return null;
  if (state.phase === "idle" || state.phase === "checking" || state.phase === "uptodate") return null;

  const box = {
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 8
  } as const;

  if (state.phase === "downloading") {
    const pct = Math.round(state.progress * 100);
    return (
      <View style={box}>
        <Text style={{ color: c.ink900, fontWeight: "600", fontSize: 13 }}>
          Downloading update · {pct}%
        </Text>
        {/* The bar itself. A real figure from the bytes written, not a spinner. */}
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, marginTop: 8, overflow: "hidden" }}>
          <View style={{ height: 6, width: `${Math.max(2, pct)}%`, backgroundColor: c.brand600 }} />
        </View>
        <Text style={{ color: c.ink500, fontSize: 11, marginTop: 6 }}>
          {formatBytes(state.received)} of {formatBytes(state.total)}
        </Text>
      </View>
    );
  }

  if (state.phase === "verifying" || state.phase === "installing") {
    return (
      <View style={[box, { flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <ActivityIndicator />
        <Text style={{ color: c.ink900, fontSize: 13 }}>
          {state.phase === "verifying" ? "Checking the download…" : "Opening the installer…"}
        </Text>
      </View>
    );
  }

  if (state.phase === "error") {
    return (
      <View style={box}>
        <Text style={{ color: "#b91c1c", fontSize: 12 }}>{state.message}</Text>
        <Pressable onPress={() => setDismissed(true)} style={{ marginTop: 8 }}>
          <Text style={{ color: c.ink500, fontSize: 12 }}>Dismiss</Text>
        </Pressable>
      </View>
    );
  }

  // available
  return (
    <View style={box}>
      <Text style={{ color: c.ink900, fontWeight: "600", fontSize: 13 }}>
        Update available · {state.info.version}
      </Text>
      <Text style={{ color: c.ink500, fontSize: 11, marginTop: 2 }}>
        You have {currentVersion()}
        {state.info.sizeBytes ? ` · ${formatBytes(state.info.sizeBytes)}` : ""}
      </Text>
      {state.info.notes ? (
        <Text style={{ color: c.ink700, fontSize: 12, marginTop: 6 }}>{state.info.notes}</Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Pressable onPress={start}>
          <View style={{ backgroundColor: c.brand600, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Update now</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)}>
          <View style={{ backgroundColor: c.line, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: c.ink700, fontWeight: "600", fontSize: 12 }}>Later</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
