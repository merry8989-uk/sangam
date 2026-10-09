import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { createRoom, listRooms, resolveJoinCode, type RoomKind, type RoomSummary } from "../src/api";
import { Button, Card, Empty, Heading, Loading, Pill, Screen, useColors } from "../src/ui";

export default function LiveTab() {
  const c = useColors();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await listRooms();
      setRooms(d.items ?? []);
      setConfigured(d.livekitConfigured !== false);
    } catch {
      // signed out
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function start(kind: RoomKind) {
    setBusy(kind);
    setError(null);
    try {
      const d = await createRoom(kind, kind === "LIVE" ? "PUBLIC" : "PRIVATE");
      router.push(`/room/${d.room.id}`);
    } catch {
      setError("Sign in first, then try again.");
    }
    setBusy(null);
  }

  async function joinCode() {
    const v = code.trim();
    if (!v) return;
    setBusy("JOIN");
    setError(null);
    try {
      const d = await resolveJoinCode(v);
      router.push(`/room/${d.room.id}?code=${encodeURIComponent(v.toUpperCase())}`);
    } catch {
      setError("No room with that code.");
    }
    setBusy(null);
  }

  if (loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {!configured ? (
          <Card>
            <Text style={{ color: "#dc2626", fontSize: 12 }}>
              The media server is not configured on the backend, so rooms cannot connect yet.
            </Text>
          </Card>
        ) : null}

        <Card>
          <Heading>Start</Heading>
          <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
            Calls, meetings and live streams run on the same server.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Button label={busy === "CALL" ? "..." : "Start a call"} onPress={() => start("CALL")} disabled={busy !== null} />
            <Button label={busy === "MEETING" ? "..." : "Start a meeting"} variant="ghost" onPress={() => start("MEETING")} disabled={busy !== null} />
            <Button label={busy === "LIVE" ? "..." : "Go live"} variant="ghost" onPress={() => start("LIVE")} disabled={busy !== null} />
          </View>
        </Card>

        <Card>
          <Heading>Join with a code</Heading>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
            <View style={{ flex: 1, borderColor: c.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, backgroundColor: c.canvas }}>
              <Text
                style={{ color: c.ink900, paddingVertical: 10, letterSpacing: 2 }}
                onPress={() => {}}
              >
                {code || "enter code"}
              </Text>
            </View>
            <Button label="Join" onPress={joinCode} disabled={busy !== null} />
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {"ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split("").map((ch) => (
              <Pressable key={ch} onPress={() => setCode((v) => (v.length < 8 ? v + ch : v))}>
                <Pill label={ch} />
              </Pressable>
            ))}
          </View>
        </Card>

        {error ? <Text style={{ color: "#dc2626", fontSize: 12 }}>{error}</Text> : null}

        <Card>
          <Heading>Rooms</Heading>
          {rooms.length === 0 ? (
            <Empty text="No rooms yet." />
          ) : (
            rooms.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/room/${r.id}`)} style={{ paddingVertical: 8 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Text style={{ color: c.ink900, fontWeight: "500" }}>{r.name}</Text>
                  <Pill label={r.kind} />
                  {r.isLive ? <Pill label="LIVE" active /> : null}
                </View>
                <Text style={{ color: c.ink500, fontSize: 11, marginTop: 2 }}>@{r.owner.username}</Text>
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
