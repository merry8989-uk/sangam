import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LiveKitRoom, VideoTrack, useTracks } from "@livekit/react-native";
import { Track } from "livekit-client";
import { Card, Heading, Screen, useColors } from "../src/ui";

/**
 * The call for an anonymous chat.
 *
 * The same room serves a video call, an audio call and a group call: what it is
 * depends on what people publish. The token comes from
 * `POST /api/anon/chat/[id]/call`, and the identity in it is a per-chat
 * pseudonym - the room never learns who anyone is.
 *
 * The token is passed through the route rather than fetched here, because the
 * screen is only reachable from a chat and the server has already decided that
 * the viewer belongs in it.
 */

function Stage() {
  const c = useColors();
  const tracks = useTracks([Track.Source.Camera]);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {tracks.map((t) => (
        <View
          key={t.participant.identity + t.source}
          style={{ width: "48%", borderRadius: 10, overflow: "hidden", backgroundColor: "#000" }}
        >
          <VideoTrack trackRef={t} style={{ width: "100%", height: 140 }} />
          <Text style={{ color: "#fff", fontSize: 11, padding: 4 }}>
            {t.participant.name || t.participant.identity}
          </Text>
        </View>
      ))}
      {tracks.length === 0 ? (
        <Text style={{ color: c.ink500, fontSize: 12 }}>Waiting for someone to turn a camera on.</Text>
      ) : null}
    </View>
  );
}

export default function AnonCallScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ token?: string; ws?: string; video?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const wsUrl = typeof params.ws === "string" ? params.ws : "";
  const wantVideo = params.video !== "0";
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(wantVideo);

  if (!token || !wsUrl) {
    return (
      <Screen>
        <View style={{ padding: 12 }}>
          <Card>
            <Text style={{ color: "#b91c1c", fontSize: 13 }}>
              No call token. Start the call from the chat.
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: 12, gap: 12 }}>
        <Card>
          <Heading>{wantVideo ? "Video call" : "Audio call"}</Heading>
          <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
            Nobody in this call can see who you are. Your name here is a pseudonym for this chat.
          </Text>
        </Card>

        <Card>
          <LiveKitRoom
            serverUrl={wsUrl}
            token={token}
            connect
            audio={micOn}
            video={camOn}
            style={{ gap: 8 }}
          >
            <Stage />
          </LiveKitRoom>
        </Card>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => setMicOn((v) => !v)}>
            <View style={{ backgroundColor: micOn ? c.line : "#fee2e2", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: micOn ? c.ink700 : "#b91c1c", fontWeight: "600", fontSize: 12 }}>
                {micOn ? "Mute" : "Unmute"}
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setCamOn((v) => !v)}>
            <View style={{ backgroundColor: camOn ? c.line : "#fee2e2", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: camOn ? c.ink700 : "#b91c1c", fontWeight: "600", fontSize: 12 }}>
                {camOn ? "Camera off" : "Camera on"}
              </Text>
            </View>
          </Pressable>
        </View>

        <Text style={{ color: c.ink500, fontSize: 10 }}>
          Virtual backgrounds are applied on the web call screen. On the phone the camera is
          published as it is, so there is nothing to switch.
        </Text>
      </View>
    </Screen>
  );
}
