import { useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, mediaUrl, type Post } from "../../src/api";
import { Avatar, Card, Empty, Loading, Pill, Screen, useColors } from "../../src/ui";

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

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Avatar name={post.author.username} />
            <Text style={{ color: c.ink900, fontWeight: "500" }}>@{post.author.username}</Text>
          </View>
          {!!post.caption && <Text style={{ color: c.ink900, marginTop: 10, fontSize: 16 }}>{post.caption}</Text>}
          {post.media.map((m) =>
            m.thumbnailKey ? (
              <Image
                key={m.id}
                source={{ uri: mediaUrl(m.thumbnailKey) }}
                style={{ height: 220, borderRadius: 8, marginTop: 10 }}
                resizeMode="cover"
              />
            ) : null
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Pill label={`${post.viewCount} views`} active />
            <Pill label={post.type} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
