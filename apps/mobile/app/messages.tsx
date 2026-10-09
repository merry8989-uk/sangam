import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { api } from "../src/api";
import { Avatar, Button, Empty, Loading, Screen, useColors } from "../src/ui";
import { useRouter } from "expo-router";
import { hasToken } from "../src/api";

type Conversation = {
  id: string;
  updatedAt: string;
  participants: { user: { id: string; username: string } }[];
};

export default function Messages() {
  const c = useColors();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api<{ items: Conversation[] }>("/api/dm");
        setItems(d.items ?? []);
      } catch {
        // not signed in
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <Screen><Loading /></Screen>;

  if (!hasToken()) {
    return (
      <Screen>
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={{ color: c.ink900 }}>Sign in to see your messages.</Text>
          <Button label="Sign in" onPress={() => router.push("/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={<Empty text="No conversations yet." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/post/${item.id}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
              <Avatar name={item.participants[0]?.user.username ?? "?"} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink900, fontWeight: "500" }}>
                  @{item.participants[0]?.user.username ?? "unknown"}
                </Text>
                <Text style={{ color: c.ink500, fontSize: 12 }}>
                  {new Date(item.updatedAt).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
