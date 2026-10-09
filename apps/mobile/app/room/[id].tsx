import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LiveKitRoom, VideoTrack, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { joinRoom, type RoomSummary } from "../../src/api";
import { Button, Card, Heading, Loading, Pill, Screen, useColors } from "../../src/ui";

type Joined = { token: string; wsUrl: string; role: string; canPublish: boolean };

// The live video grid. Only reachable once the server has handed us a token.
function Stage({ canPublish }: { canPublish: boolean }) {
  const c = useColors();
  const tracks = useTracks([Track.Source.Camera]);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {tracks.map((t) => (
        <View key={t.participant.identity + t.source} style={{ width: "48%", borderRadius: 10, overflow: "hidden", backgroundColor: "#000" }}>
          <VideoTrack trackRef={t} style={{ width: "100%", height: 140 }} />
          <Text style={{ color: "#fff", fontSize: 11, padding: 4 }}>
            {t.participant.name || t.participant.identity}
          </Text>
        </View>
      ))}
      {tracks.length === 0 ? (
        <Text style={{ color: c.ink500, fontSize: 12 }}>
          {canPublish ? "Waiting for your camera..." : "Waiting for the host to start."}
        </Text>
      ) : null}
    </View>
  );
}

export default function RoomScreen() {
  const c = useColors();
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await fetch(`${(await import("../../src/api")).BASE_URL}/api/rooms/${id}`);
        const body = await d.json();
        setRoom(body.room);
      } catch {
        setError("Could not load this room.");
      }
      setLoading(false);
    })();
  }, [id]);

  const join = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await joinRoom(String(id), typeof code === "string" ? code : undefined);
      if (!d.token || !d.wsUrl) {
        setError(d.warning ?? "LiveKit is not configured on the server.");
        return;
      }
      setJoined({ token: d.token, wsUrl: d.wsUrl, role: d.role, canPublish: Boolean(d.canPublish) });
    } catch {
      setError("Could not join this room.");
    }
    setBusy(false);
  }, [id, code]);

  if (loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <View style={{ padding: 12, gap: 12 }}>
        <Card>
          <Heading>{room?.name ?? "Room"}</Heading>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Pill label={room?.kind ?? ""} active />
            {room?.isLive ? <Pill label="LIVE" active /> : null}
            <Pill label={room?.status ?? ""} />
          </View>
          {room ? (
            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 8 }}>
              Host @{room.owner.username} - join code {room.joinCode}
            </Text>
          ) : null}
        </Card>

        {!joined ? (
          <Card>
            <Text style={{ color: c.ink700, fontSize: 13 }}>
              {room?.kind === "LIVE"
                ? "Watch the stream, or go live from this device."
                : "Join to start talking."}
            </Text>
            <View style={{ marginTop: 10 }}>
              <Button label={busy ? "Joining..." : room?.kind === "LIVE" ? "Watch live" : "Join room"} onPress={join} disabled={busy} />
            </View>
            {error ? <Text style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
          </Card>
        ) : (
          <Card>
            <LiveKitRoom
              serverUrl={joined.wsUrl}
              token={joined.token}
              connect
              audio={joined.canPublish}
              video={joined.canPublish}
              onDisconnected={() => setJoined(null)}
            >
              <Stage canPublish={joined.canPublish} />
            </LiveKitRoom>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Button label="Leave" variant="ghost" onPress={() => setJoined(null)} />
            </View>
            <Text style={{ color: c.ink500, fontSize: 11, marginTop: 8 }}>
              You are in as {joined.role}.
            </Text>
          </Card>
        )}
      </View>
    </Screen>
  );
}
