import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { api, mediaUrl, type Post } from "../src/api";
import { Avatar, Empty, Loading, Screen, useColors } from "../src/ui";
import VideoPlayer from "../src/VideoPlayer";

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
        pagingEnabled
        contentContainerStyle={{ padding: 12, gap: 12 }}
        ListEmptyComponent={<Empty text="No shorts yet." />}
        renderItem={({ item }) => {
          const v = item.media.find((m) => m.kind === "VIDEO" && m.hlsKey);
          return (
            <View style={{ gap: 8 }}>
              {v ? (
                <VideoPlayer
                  hlsUrl={v.hlsKey ? mediaUrl(v.hlsKey) : null}
                  mp4Url={v.previewKey ? mediaUrl(v.previewKey) : null}
                  poster={v.thumbnailKey ? mediaUrl(v.thumbnailKey) : null}
                  height={420}
                  loop
                />
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Avatar name={item.author.username} />
                <View>
                  <Text style={{ color: c.ink900, fontWeight: "500" }}>@{item.author.username}</Text>
                  {!!item.caption && (
                    <Text style={{ color: c.ink700, fontSize: 13 }} numberOfLines={2}>{item.caption}</Text>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}
