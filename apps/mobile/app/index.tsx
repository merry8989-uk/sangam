import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api, mediaUrl, type Post } from "../src/api";
import { Avatar, Card, Empty, Loading, Pill, Screen, useColors } from "../src/ui";

export default function Feed() {
  const c = useColors();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: Post[] }>("/api/posts?limit=20");
      setPosts(d.items ?? []);
    } catch {
      // offline: keep whatever we have
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  if (loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.brand600}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={<Empty text="No posts yet." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/post/${item.id}`)}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Avatar name={item.author.username} />
                <Text style={{ color: c.ink900, fontWeight: "500" }}>@{item.author.username}</Text>
                <Text style={{ color: c.ink500, fontSize: 12, marginLeft: "auto" }}>
                  {new Date(item.createdAt).toLocaleDateString("en-IN")}
                </Text>
              </View>
              {!!item.caption && <Text style={{ color: c.ink900, marginTop: 8 }}>{item.caption}</Text>}
              {item.media[0]?.thumbnailKey ? (
                <Image
                  source={{ uri: mediaUrl(item.media[0].thumbnailKey) }}
                  style={{ height: 200, borderRadius: 8, marginTop: 8 }}
                  resizeMode="cover"
                />
              ) : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Pill label={`${item.viewCount} views`} />
                <Pill label={item.type} />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
