import { useEffect, useState } from "react";
import { FlatList, Image, Text, View } from "react-native";
import { api, mediaUrl, type Post } from "../src/api";
import { Empty, Loading, Screen, useColors } from "../src/ui";

export default function Shorts() {
  const c = useColors();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ items: Post[] }>("/api/posts?type=SHORT&limit=20");
        setPosts(d.items ?? []);
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        ListEmptyComponent={<Empty text="No shorts yet." />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, overflow: "hidden" }}>
            {item.media[0]?.thumbnailKey ? (
              <Image source={{ uri: mediaUrl(item.media[0].thumbnailKey) }} style={{ height: 320 }} resizeMode="cover" />
            ) : null}
            <Text style={{ color: c.ink900, padding: 10 }}>{item.caption}</Text>
          </View>
        )}
      />
    </Screen>
  );
}
