import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  api,
  createSkipSegment,
  deleteSkipSegment,
  getSkipSegments,
  getThumbnailFrames,
  mediaUrl,
  playbackCap,
  setPoster,
  voteSkipSegment,
  SKIP_CATEGORIES,
  type Post,
  type SampledFrame,
  type SkipCategory,
  type SkipSegment
} from "../../src/api";
import { Avatar, Button, Card, Empty, Heading, Loading, Pill, Screen, useColors } from "../../src/ui";
import VideoPlayer from "../../src/VideoPlayer";

const mmss = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ":" + String(r).padStart(2, "0");
};

export default function PostDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const [segments, setSegments] = useState<SkipSegment[]>([]);
  const [skipEnabled, setSkipEnabled] = useState(true);
  const [cap, setCap] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [isOwner, setIsOwner] = useState(false);

  // Thumbnail picker
  const [frames, setFrames] = useState<SampledFrame[]>([]);
  const [posterKey, setPosterKey] = useState<string | null>(null);
  const [framesBusy, setFramesBusy] = useState(false);

  // Skip-point editor state
  const [startAt, setStartAt] = useState<number | null>(null);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [category, setCategory] = useState<SkipCategory>("NONSENSE");
  const [visibility, setVisibility] = useState<"SELF" | "EVERYONE">("SELF");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const video = post?.media.find((m) => m.kind === "VIDEO" && m.hlsKey) ?? null;

  const loadSegments = useCallback(async (mediaId: string) => {
    try {
      const d = await getSkipSegments(mediaId);
      setSegments(d.items ?? []);
    } catch {
      // offline
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ post: Post; isOwner?: boolean }>(`/api/posts/${id}`);
        setPost(d.post);
        setIsOwner(Boolean(d.isOwner));
        const v = d.post.media.find((m) => m.kind === "VIDEO" && m.hlsKey);
        if (v) {
          await loadSegments(v.id);
          setPosterKey(v.thumbnailKey);
        }
      } catch {
        // not found
      }
      try {
        const s = await api<{ settings: { sponsorSkip?: boolean; videoQuality?: string; audioQuality?: string } }>(
          "/api/settings"
        );
        setSkipEnabled(s.settings?.sponsorSkip ?? true);
        setCap(playbackCap(s.settings?.videoQuality, s.settings?.audioQuality));
      } catch {
        setSkipEnabled(true); // guest: community skipping stays on
      }
      setLoading(false);
    })();
  }, [id, loadSegments]);

  async function save() {
    if (!video) return;
    if (startAt === null || endAt === null) {
      setNote("Mark a start and an end first.");
      return;
    }
    if (endAt <= startAt) {
      setNote("The end must come after the start.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      await createSkipSegment({
        mediaId: video.id,
        startSec: startAt,
        endSec: endAt,
        category,
        visibility
      });
      await loadSegments(video.id);
      setStartAt(null);
      setEndAt(null);
      setNote(visibility === "EVERYONE" ? "Saved for everyone." : "Saved for you only.");
    } catch {
      setNote("Could not save the skip point.");
    }
    setBusy(false);
  }

  async function remove(segId: string) {
    try {
      await deleteSkipSegment(segId);
      if (video) await loadSegments(video.id);
    } catch {
      setNote("Could not delete it.");
    }
  }

  async function vote(segId: string, value: 1 | -1) {
    try {
      await voteSkipSegment(segId, value);
      if (video) await loadSegments(video.id);
    } catch {
      // ignore
    }
  }

  if (loading) return <Screen><Loading /></Screen>;
  if (!post) return <Screen><Empty text="Post not found." /></Screen>;

  const images = post.media.filter((m) => m.kind !== "VIDEO" && m.thumbnailKey);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Avatar name={post.author.username} />
            <Text style={{ color: c.ink900, fontWeight: "500" }}>@{post.author.username}</Text>
          </View>
          {!!post.caption && (
            <Text style={{ color: c.ink900, marginTop: 10, fontSize: 16 }}>{post.caption}</Text>
          )}

          {video ? (
            <View style={{ marginTop: 10 }}>
              <VideoPlayer
                hlsUrl={video.hlsKey ? mediaUrl(video.hlsKey) : null}
                mp4Url={video.previewKey ? mediaUrl(video.previewKey) : null}
                poster={video.thumbnailKey ? mediaUrl(video.thumbnailKey) : null}
                height={240}
                segments={segments}
                skipEnabled={skipEnabled}
                onTimeUpdate={setNow}
                variants={(video.renditions ?? []).map((r) => ({ height: r.height, url: mediaUrl(r.playlistKey) }))}
                cap={cap}
              />
            </View>
          ) : null}

          {images.map((m) => (
            <Image
              key={m.id}
              source={{ uri: mediaUrl(m.thumbnailKey as string) }}
              style={{ height: 220, borderRadius: 8, marginTop: 10 }}
              resizeMode="cover"
            />
          ))}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pill label={`${post.viewCount} views`} active />
            <Pill label={post.type} />
          </View>
        </Card>

        {video ? (
          <Card>
            <Heading>Skip points</Heading>
            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
              Mark a part once - it is skipped whenever you play this video again.
              Share it with everyone and it is skipped for them too.
            </Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button label={`Mark start  ${mmss(now)}`} variant="ghost" onPress={() => setStartAt(now)} />
              <Button label={`Mark end  ${mmss(now)}`} variant="ghost" onPress={() => setEndAt(now)} />
            </View>
            <Text style={{ color: c.ink700, fontSize: 12, marginTop: 8 }}>
              {startAt === null ? "start: -" : `start: ${mmss(startAt)}`}
              {"   "}
              {endAt === null ? "end: -" : `end: ${mmss(endAt)}`}
            </Text>

            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 10 }}>Category</Text>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {SKIP_CATEGORIES.map((cat) => (
                <Pressable key={cat} onPress={() => setCategory(cat)}>
                  <Pill label={cat} active={category === cat} />
                </Pressable>
              ))}
            </View>

            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 10 }}>Who is it for?</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Pressable onPress={() => setVisibility("SELF")}>
                <Pill label="Only me" active={visibility === "SELF"} />
              </Pressable>
              <Pressable onPress={() => setVisibility("EVERYONE")}>
                <Pill label="Everyone" active={visibility === "EVERYONE"} />
              </Pressable>
            </View>

            <View style={{ marginTop: 12 }}>
              <Button label={busy ? "Saving..." : "Save skip point"} onPress={save} disabled={busy} />
            </View>
            {note ? <Text style={{ color: c.ink700, fontSize: 12, marginTop: 8 }}>{note}</Text> : null}

            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 14 }}>
              {segments.length} skip point{segments.length === 1 ? "" : "s"} on this video
            </Text>
            {segments.map((s) => (
              <View
                key={s.id}
                style={{ borderTopWidth: 1, borderTopColor: c.line, marginTop: 8, paddingTop: 8, gap: 4 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Pill label={s.category} active />
                  <Text style={{ color: c.ink700, fontSize: 12 }}>
                    {mmss(s.startSec)} - {mmss(s.endSec)}
                  </Text>
                  <Pill label={s.visibility === "SELF" ? "only me" : "everyone"} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Text style={{ color: c.ink500, fontSize: 11 }}>
                    {s.mine ? "yours" : `@${s.authorName ?? "someone"}`}
                  </Text>
                  {!s.mine && s.visibility === "EVERYONE" ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable onPress={() => vote(s.id, 1)}>
                        <Text style={{ color: c.brand700, fontSize: 12 }}>Helpful {s.upvotes}</Text>
                      </Pressable>
                      <Pressable onPress={() => vote(s.id, -1)}>
                        <Text style={{ color: c.ink500, fontSize: 12 }}>Not {s.downvotes}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {s.mine ? (
                    <Pressable onPress={() => remove(s.id)}>
                      <Text style={{ color: "#dc2626", fontSize: 12 }}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {video && isOwner ? (
          <Card>
            <Heading>Thumbnail</Heading>
            <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
              Pick the frame people see before they play.
            </Text>
            {posterKey ? (
              <Image
                source={{ uri: mediaUrl(posterKey) }}
                style={{ height: 120, borderRadius: 8, marginTop: 10 }}
                resizeMode="cover"
              />
            ) : null}
            <View style={{ marginTop: 10 }}>
              <Button
                label={framesBusy ? "Working..." : frames.length ? "Refresh frames" : "Choose a frame"}
                variant="ghost"
                disabled={framesBusy}
                onPress={async () => {
                  setFramesBusy(true);
                  try {
                    const d = await getThumbnailFrames(video.id, 8);
                    setFrames(d.frames ?? []);
                  } catch {
                    setNote("Could not generate frames.");
                  }
                  setFramesBusy(false);
                }}
              />
            </View>
            {frames.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {frames.map((f) => (
                  <Pressable
                    key={f.key}
                    disabled={framesBusy}
                    onPress={async () => {
                      setFramesBusy(true);
                      try {
                        const r = await setPoster(video.id, f.atSec);
                        setPosterKey(r.thumbnailKey);
                        setFrames([]);
                        setNote("Thumbnail updated.");
                      } catch {
                        setNote("Could not set the poster.");
                      }
                      setFramesBusy(false);
                    }}
                    style={{ width: "31%", borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: c.line }}
                  >
                    <Image source={{ uri: mediaUrl(f.key) }} style={{ height: 64, width: "100%" }} resizeMode="cover" />
                    <Text style={{ color: c.ink500, fontSize: 10, textAlign: "center", paddingVertical: 2 }}>
                      {f.atSec}s
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
