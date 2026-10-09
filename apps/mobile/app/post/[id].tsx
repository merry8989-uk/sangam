import { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, mediaUrl, type Post } from "../../src/api";
import { Avatar, Card, Empty, Loading, Pill, Screen, useColors } from "../../src/ui";
import VideoPlayer from "../../src/VideoPlayer";

export default function PostDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ post: Post }>(`/api/posts/${id}`);
        setPost(d.post);
      } catch {
        // not found
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <Screen><Loading /></Screen>;
  if (!post) return <Screen><Empty text="Post not found." /></Screen>;

  const video = post.media.find((m) => m.kind === "VIDEO" && m.hlsKey);
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
      </ScrollView>
    </Screen>
  );
}
