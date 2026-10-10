import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useColors } from "./ui";
import { qualityLabel, type SkipSegment } from "./api";

export type QualityOption = { height: number; url: string };

// A video player with the controls from the design notes: play/pause, skip,
// speed, mute, audio-only, background play, picture-in-picture - and automatic
// skipping of skip points (the author's own, plus community ones when enabled).
export type VideoPlayerProps = {
  hlsUrl?: string | null;
  mp4Url?: string | null;
  poster?: string | null;
  autoPlay?: boolean;
  mutedByDefault?: boolean;
  loop?: boolean;
  height?: number;
  segments?: SkipSegment[];
  skipEnabled?: boolean;
  onTimeUpdate?: (t: number) => void;
  variants?: QualityOption[];
  cap?: number | null;
};

const SPEEDS = [0.5, 1, 1.5, 2];
const SKIP = 10;

export default function VideoPlayer(props: VideoPlayerProps) {
  const c = useColors();
  const uri = props.hlsUrl || props.mp4Url || null;

  const [playing, setPlaying] = useState(Boolean(props.autoPlay));
  const [muted, setMuted] = useState(Boolean(props.mutedByDefault ?? props.autoPlay));
  const [rate, setRate] = useState(1);
  const [bg, setBg] = useState(false);
  const [pip, setPip] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [barW, setBarW] = useState(0);
  const [skipped, setSkipped] = useState<string | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const viewRef = useRef<VideoView>(null);

  // Pick the rendition that fits the viewer's cap, or the master for auto.
  const cappedUrl =
    props.cap != null && props.variants && props.variants.length
      ? ([...props.variants].sort((a, b) => b.height - a.height).find((v) => v.height <= (props.cap as number)) ?? null)
      : null;
  const initialUri = cappedUrl ? cappedUrl.url : uri;

  const player = useVideoPlayer(initialUri, (p) => {
    p.loop = Boolean(props.loop);
    p.muted = Boolean(props.mutedByDefault ?? props.autoPlay);
    if (props.autoPlay) p.play();
  });

  useEffect(() => {
    if (cappedUrl) setQuality(cappedUrl.height);
  }, [cappedUrl]);

  // Switching quality means loading a different playlist, keeping the position.
  const applyQuality = async (height: number | null) => {
    const target =
      height === null
        ? props.hlsUrl || props.mp4Url || null
        : props.variants?.find((v) => v.height === height)?.url ?? null;
    if (!target) return;
    const at = player.currentTime ?? 0;
    const wasPlaying = player.playing;
    setQuality(height);
    try {
      await player.replaceAsync({ uri: target, contentType: "hls" });
      player.currentTime = at;
      if (wasPlaying) player.play();
    } catch {
      // Keep playing what we already have.
    }
  };

  // expo-video's values are not reactive, so poll. This also drives auto-skip.
  useEffect(() => {
    const t = setInterval(() => {
      const now = player.currentTime ?? 0;
      setTime(now);
      setDur(player.duration ?? 0);
      setPlaying(player.playing);
      props.onTimeUpdate?.(now);

      if (props.skipEnabled && props.segments && props.segments.length && player.playing) {
        // -0.15 keeps us from re-triggering on the segment's own end frame.
        const hit = props.segments.find((s) => now >= s.startSec && now < s.endSec - 0.15);
        if (hit) {
          player.currentTime = hit.endSec;
          setTime(hit.endSec);
          setSkipped(hit.category);
          setTimeout(() => setSkipped(null), 1500);
        }
      }
    }, 400);
    return () => clearInterval(t);
  }, [player, props.segments, props.skipEnabled, props.onTimeUpdate]);

  if (!uri) return null;

  const togglePlay = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };
  const skip = (s: number) => {
    const next = Math.max(0, (player.currentTime ?? 0) + s);
    player.currentTime = next;
    setTime(next);
  };
  const cycleSpeed = () => {
    const i = SPEEDS.indexOf(rate);
    const n = SPEEDS[(i + 1) % SPEEDS.length];
    setRate(n);
    player.playbackRate = n;
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    player.muted = m;
  };
  const toggleBg = () => {
    const b = !bg;
    setBg(b);
    player.staysActiveInBackground = b;
  };
  const toggleAudioOnly = () => setAudioOnly((a) => !a);
  const togglePip = async () => {
    try {
      if (pip) viewRef.current?.stopPictureInPicture();
      else await viewRef.current?.startPictureInPicture();
      setPip(!pip);
    } catch {
      // PiP is not available on every device/OS build.
    }
  };

  const btn = (active?: boolean) => ({
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: active ? c.brand100 : c.surface
  });
  const label = (active?: boolean) => ({
    color: active ? c.brand700 : c.ink700,
    fontSize: 12,
    fontWeight: "500" as const
  });

  const pct = dur > 0 ? Math.min(1, time / dur) : 0;
  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return m + ":" + String(r).padStart(2, "0");
  };

  return (
    <View style={{ borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}>
      <View style={{ height: props.height ?? 220 }}>
        <VideoView
          ref={viewRef}
          player={player}
          style={{ flex: 1 }}
          nativeControls={false}
          allowsFullscreen
          allowsPictureInPicture
          contentFit="contain"
        />
        {audioOnly && (
          <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center", backgroundColor: "#000" }]}>
            <Text style={{ color: "#fff", fontSize: 13 }}>Audio only</Text>
          </View>
        )}
        {skipped && (
          <View style={[StyleSheet.absoluteFillObject, { alignItems: "flex-end", justifyContent: "flex-start", padding: 10 }]}>
            <View style={{ backgroundColor: "#000000cc", borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
              <Text style={{ color: "#fff", fontSize: 12 }}>Skipped {skipped}</Text>
            </View>
          </View>
        )}
      </View>

      <Pressable
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (barW > 0 && dur > 0) {
            const r = Math.min(1, Math.max(0, e.nativeEvent.locationX / barW));
            player.currentTime = r * dur;
            setTime(r * dur);
          }
        }}
        style={{ height: 4, backgroundColor: c.line }}
      >
        <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: c.brand600 }} />
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, padding: 8, backgroundColor: c.surface }}>
        <Pressable onPress={togglePlay} style={btn(playing)}>
          <Text style={label(playing)}>{playing ? "Pause" : "Play"}</Text>
        </Pressable>
        <Pressable onPress={() => skip(-SKIP)} style={btn()}>
          <Text style={label()}>-10s</Text>
        </Pressable>
        <Pressable onPress={() => skip(SKIP)} style={btn()}>
          <Text style={label()}>+10s</Text>
        </Pressable>
        <Pressable onPress={cycleSpeed} style={btn(rate !== 1)}>
          <Text style={label(rate !== 1)}>{rate}x</Text>
        </Pressable>
        <Pressable onPress={toggleMute} style={btn(muted)}>
          <Text style={label(muted)}>{muted ? "Unmute" : "Mute"}</Text>
        </Pressable>
        <Pressable onPress={toggleAudioOnly} style={btn(audioOnly)}>
          <Text style={label(audioOnly)}>Audio only</Text>
        </Pressable>
        <Pressable onPress={toggleBg} style={btn(bg)}>
          <Text style={label(bg)}>Background</Text>
        </Pressable>
        <Pressable onPress={togglePip} style={btn(pip)}>
          <Text style={label(pip)}>PiP</Text>
        </Pressable>
        <Text style={{ color: c.ink500, fontSize: 11, marginLeft: "auto" }}>
          {mmss(time)} / {mmss(dur)}
        </Text>
      </View>

      {props.variants && props.variants.length > 1 ? (
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingHorizontal: 8, paddingBottom: 8, backgroundColor: c.surface }}>
          <Text style={{ color: c.ink500, fontSize: 11 }}>Quality</Text>
          <Pressable onPress={() => applyQuality(null)} style={btn(quality === null)}>
            <Text style={label(quality === null)}>Auto</Text>
          </Pressable>
          {[...props.variants]
            .sort((a, b) => b.height - a.height)
            .map((v) => (
              <Pressable key={v.height} onPress={() => applyQuality(v.height)} style={btn(quality === v.height)}>
                <Text style={label(quality === v.height)}>{qualityLabel(String(v.height))}</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
    </View>
  );
}
