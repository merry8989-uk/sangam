import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getConversation, sendMessage, type Conversation, type DirectMessage } from "../../src/api";
import { Avatar, Button, Loading, Screen, useColors } from "../../src/ui";

/**
 * One conversation.
 *
 * This screen did not exist. The messages list pushed to `/post/<id>` with a
 * conversation id, which fetched a post that was never there and showed
 * "Post not found" - so tapping a conversation went nowhere. The route that
 * serves it (`/api/dm/[id]`) was already there and already returned everything
 * this needs.
 */
export default function ConversationScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [other, setOther] = useState<Conversation["other"]>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<DirectMessage>>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await getConversation(id);
      setOther(d.other ?? null);
      setMessages(d.messages ?? []);
      setError(null);
    } catch {
      setError("Could not load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body || busy || !id) return;
    setBusy(true);
    setDraft("");
    try {
      const created = await sendMessage(id, body);
      setMessages((prev) => [...prev, created]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      // Put the text back rather than losing what they typed.
      setDraft(body);
      setError("Message did not send.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: c.line
          }}
        >
          <Avatar name={other?.username ?? "?"} size={36} />
          <Text style={{ color: c.ink900, fontWeight: "600" }}>
            @{other?.username ?? "unknown"}
          </Text>
        </View>

        {error ? (
          <Text style={{ color: "#dc2626", fontSize: 12, padding: 12 }}>{error}</Text>
        ) : null}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={{ color: c.ink500, fontSize: 12, textAlign: "center", paddingTop: 24 }}>
              No messages yet. Say something.
            </Text>
          }
          renderItem={({ item }) => {
            // Own messages are aligned right. The list does not carry the
            // viewer's id, so compare against the conversation's other party.
            const mine = other ? item.senderId !== other.id : false;
            return (
              <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                <View
                  style={{
                    maxWidth: "80%",
                    backgroundColor: mine ? c.brand600 : c.surface,
                    borderColor: c.line,
                    borderWidth: mine ? 0 : 1,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 7
                  }}
                >
                  <Text style={{ color: mine ? "#fff" : c.ink900, fontSize: 14 }}>{item.body}</Text>
                </View>
                <Text style={{ color: c.ink500, fontSize: 10, marginTop: 2 }}>
                  {new Date(item.createdAt).toLocaleTimeString("en-IN")}
                </Text>
              </View>
            );
          }}
        />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 12,
            borderTopWidth: 1,
            borderTopColor: c.line
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            multiline
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: c.ink900,
              maxHeight: 110
            }}
          />
          <Pressable onPress={send} disabled={busy || !draft.trim()}>
            <View
              style={{
                backgroundColor: busy || !draft.trim() ? c.line : c.brand600,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 10
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
                {busy ? "..." : "Send"}
              </Text>
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
