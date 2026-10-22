import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { listConversations, type Conversation } from "../src/api";
import { Avatar, Button, Empty, Loading, Screen, useColors } from "../src/ui";
import { useRouter } from "expo-router";
import { hasToken } from "../src/api";

export default function Messages() {
  const c = useColors();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await listConversations();
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
          <Pressable onPress={() => router.push(`/dm/${item.id}`)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
              <Avatar name={item.other?.username ?? "?"} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink900, fontWeight: "500" }}>
                  @{item.other?.username ?? "unknown"}
                </Text>
                {item.lastBody ? (
                  <Text style={{ color: c.ink500, fontSize: 12 }} numberOfLines={1}>
                    {item.lastBody}
                  </Text>
                ) : null}
                {item.lastAt ? (
                  <Text style={{ color: c.ink500, fontSize: 11 }}>
                    {new Date(item.lastAt).toLocaleString("en-IN")}
                  </Text>
                ) : null}
              </View>
              {item.unread > 0 ? (
                <View style={{ backgroundColor: c.brand600, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>{item.unread}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}
