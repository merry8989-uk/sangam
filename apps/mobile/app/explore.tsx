import { useEffect, useState } from "react";
import { FlatList, Image, Text, View } from "react-native";
import { api, mediaUrl, type Post } from "../src/api";
import { Empty, Loading, Screen, useColors } from "../src/ui";

export default function Explore() {
  const c = useColors();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ items: Post[] }>("/api/posts?type=VIDEO&limit=30");
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
        numColumns={2}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Empty text="Nothing to explore yet." />}
        renderItem={({ item }) => (
          <View style={{ flex: 1, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 10, overflow: "hidden" }}>
            {item.media[0]?.thumbnailKey ? (
              <Image source={{ uri: mediaUrl(item.media[0].thumbnailKey) }} style={{ height: 150 }} resizeMode="cover" />
            ) : (
              <View style={{ height: 150, backgroundColor: c.brand50 }} />
            )}
            <Text numberOfLines={2} style={{ color: c.ink900, padding: 8, fontSize: 12 }}>{item.caption}</Text>
          </View>
        )}
      />
    </Screen>
  );
}
