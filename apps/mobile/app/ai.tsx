import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "../src/api";
import { Button, Card, Heading, Screen, useColors } from "../src/ui";

type Msg = { role: "user" | "assistant"; content: string };

export default function Ai() {
  const c = useColors();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const d = await api<{ content: string }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next })
      });
      setMessages([...next, { role: "assistant", content: d.content }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Could not reach the AI service." }]);
    }
    setBusy(false);
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
          {messages.length === 0 && (
            <Card>
              <Heading>Sangam AI</Heading>
              <Text style={{ color: c.ink500, marginTop: 6 }}>
                Ask anything. Chat works without signing in.
              </Text>
            </Card>
          )}
          {messages.map((m, i) => (
            <View
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                backgroundColor: m.role === "user" ? c.brand600 : c.surface,
                borderColor: c.line,
                borderWidth: m.role === "user" ? 0 : 1,
                borderRadius: 14,
                padding: 10
              }}
            >
              <Text style={{ color: m.role === "user" ? "#fff" : c.ink900 }}>{m.content}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface }}>
          <TextInput
            style={{ flex: 1, borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 10, color: c.ink900, backgroundColor: c.canvas }}
            placeholder="Message..."
            placeholderTextColor={c.ink500}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
          />
          <Button label={busy ? "..." : "Send"} onPress={send} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
