import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "../src/api";
import { Button, Empty, Loading, Screen, useColors } from "../src/ui";

/**
 * Anonymous chat, on the phone.
 *
 * The same two keys as the web: a permanent one that keeps a chat alive, and a
 * temporary one with a duration the user picks. A chat is titled by its mode and
 * how long it has left, never by a name - there is no name to show.
 *
 * Kept to one screen with a mode switch rather than a stack of routes: the whole
 * flow is "pick a key, open a chat, type", and a screen for each step would be
 * three taps for one.
 */

type Chat = {
  id: string;
  kind: string;
  mode: string;
  label: string;
  remaining: string;
  memberCount: number;
};

type Message = {
  id: string;
  senderId: string;
  kind: string;
  body: string | null;
  createdAt: string;
  attachments: { id: string; name: string; storageKey: string }[];
};

type Preset = { seconds: number; label: string };

export default function AnonScreen() {
  const c = useColors();
  const [mode, setMode] = useState<"home" | "chat">("home");
  const [fixedKey, setFixedKey] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [duration, setDuration] = useState(3600);
  const [minted, setMinted] = useState<string | null>(null);
  const [joinKey, setJoinKey] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [chatLabel, setChatLabel] = useState("");
  const [chatRemaining, setChatRemaining] = useState("");
  const [chatMode, setChatMode] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const d = await api<{ items: Chat[] }>("/api/anon/chat");
      setChats(d.items ?? []);
    } catch {
      /* not signed in */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const k = await api<{ key: string }>("/api/anon/key");
        setFixedKey(k.key);
      } catch {
        /* not signed in */
      }
      try {
        const o = await api<{ presets: Preset[] }>("/api/anon/temp-key");
        setPresets(o.presets ?? []);
        if (o.presets?.length) setDuration(o.presets[4]?.seconds ?? 3600);
      } catch {
        /* ignore */
      }
      await loadChats();
    })();
  }, [loadChats]);

  async function mint() {
    setBusy(true);
    setError(null);
    setMinted(null);
    try {
      const d = await api<{ key: { key: string } }>("/api/anon/temp-key", {
        method: "POST",
        body: JSON.stringify({ duration })
      });
      setMinted(d.key.key);
      setNotice("Key created. It works once and dies when the time is up.");
    } catch {
      setError("Could not create a key.");
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    const key = joinKey.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ chat: { id: string } }>("/api/anon/chat", {
        method: "POST",
        body: JSON.stringify({ key })
      });
      setJoinKey("");
      await loadChats();
      await loadChat(d.chat.id);
    } catch {
      setError("That key does not open a chat.");
    } finally {
      setBusy(false);
    }
  }

  async function loadChat(id: string) {
    setBusy(true);
    setError(null);
    try {
      const d = await api<{
        chat: { label: string; remaining: string; mode: string };
        messages: Message[];
      }>("/api/anon/chat/" + id);
      setChatLabel(d.chat.label);
      setChatRemaining(d.chat.remaining);
      setChatMode(d.chat.mode);
      setMessages(d.messages ?? []);
      setOpenChat(id);
      setMode("chat");
    } catch {
      setError("That chat has expired or is gone.");
      await loadChats();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || !openChat || busy) return;
    setBusy(true);
    try {
      const m = await api<Message>("/api/anon/chat/" + openChat + "/message", {
        method: "POST",
        body: JSON.stringify({ body })
      });
      setDraft("");
      setMessages((prev) => [...prev, m]);
    } catch {
      setError("Could not send that.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!openChat) return;
    setBusy(true);
    try {
      await api("/api/anon/chat/" + openChat, { method: "DELETE" });
      setMode("home");
      setOpenChat(null);
      setMessages([]);
      await loadChats();
      setNotice("Chat deleted.");
    } catch {
      setError("Could not delete that.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "chat") {
    return (
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Pressable onPress={() => { setMode("home"); setOpenChat(null); setMessages([]); }}>
            <Text style={{ color: c.brand600, fontSize: 13, fontWeight: "600" }}>Back</Text>
          </Pressable>
          <Text style={{ color: c.ink900, fontWeight: "600", flex: 1 }} numberOfLines={1}>{chatLabel}</Text>
          {chatMode === "TEMPORARY" && (
            <Text style={{ color: "#b45309", fontSize: 11 }}>{chatRemaining}</Text>
          )}
        </View>

        {error ? <Text style={{ color: "#b91c1c", fontSize: 12, padding: 12 }}>{error}</Text> : null}

        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<Empty text="No messages yet." />}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 8 }}>
              {item.body ? (
                <Text style={{ color: c.ink900, fontSize: 14 }}>{item.body}</Text>
              ) : null}
              {item.attachments.length > 0 ? (
                <Text style={{ color: c.brand600, fontSize: 12, marginTop: 4 }}>
                  {item.attachments.length} file{item.attachments.length === 1 ? "" : "s"}
                </Text>
              ) : null}
              <Text style={{ color: c.ink500, fontSize: 10, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleString("en-IN")} · cannot be edited
              </Text>
            </View>
          )}
        />

        <View style={{ flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.line }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write something"
            multiline
            style={{ flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: c.ink900, maxHeight: 100 }}
          />
          <Pressable onPress={send} disabled={busy || !draft.trim()}>
            <View style={{ backgroundColor: busy || !draft.trim() ? c.line : c.brand600, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Send</Text>
            </View>
          </Pressable>
        </View>

        <Pressable onPress={destroy} style={{ padding: 12 }}>
          <Text style={{ color: "#b91c1c", fontSize: 12, textAlign: "center" }}>Delete this chat for everyone</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        {error ? <Text style={{ color: "#b91c1c", fontSize: 12 }}>{error}</Text> : null}
        {notice ? <Text style={{ color: "#15803d", fontSize: 12 }}>{notice}</Text> : null}

        <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: c.ink900, fontWeight: "600" }}>Your permanent key</Text>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 2 }}>
            Share it and anyone can chat with you. The chat stays until one of you deletes it.
          </Text>
          <Text selectable style={{ color: c.ink900, fontFamily: "monospace", fontSize: 14, marginTop: 8 }}>
            {fixedKey ?? "…"}
          </Text>
        </View>

        <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: c.ink900, fontWeight: "600" }}>A temporary key</Text>
          <Text style={{ color: c.ink500, fontSize: 11, marginTop: 2 }}>
            Pick how long it lives. When it runs out the key is destroyed and the chat is deleted from both sides.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {presets.map((p) => (
              <Pressable key={p.seconds} onPress={() => setDuration(p.seconds)}>
                <View style={{ backgroundColor: duration === p.seconds ? c.brand600 : c.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ color: duration === p.seconds ? "#fff" : c.ink700, fontSize: 11 }}>{p.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ marginTop: 10 }}>
            <Button label={busy ? "Creating…" : "Create key"} onPress={mint} />
          </View>
          {minted ? (
            <Text selectable style={{ color: "#b45309", fontFamily: "monospace", fontSize: 14, marginTop: 10 }}>
              {minted}
            </Text>
          ) : null}
        </View>

        <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: c.ink900, fontWeight: "600" }}>Open a chat with a key</Text>
          <TextInput
            value={joinKey}
            onChangeText={setJoinKey}
            placeholder="SGX-… or SGT-…"
            autoCapitalize="characters"
            style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: c.ink900, marginTop: 8, fontFamily: "monospace" }}
          />
          <View style={{ marginTop: 8 }}>
            <Button label={busy ? "Opening…" : "Open"} onPress={open} />
          </View>
        </View>

        <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12 }}>
          <Text style={{ color: c.ink900, fontWeight: "600", padding: 12 }}>Your chats</Text>
          {chats.length === 0 ? (
            <Text style={{ color: c.ink500, fontSize: 12, padding: 12, paddingTop: 0 }}>No chats yet.</Text>
          ) : (
            chats.map((ch) => (
              <Pressable key={ch.id} onPress={() => loadChat(ch.id)}>
                <View style={{ borderTopWidth: 1, borderTopColor: c.line, padding: 12 }}>
                  <Text style={{ color: c.ink900, fontSize: 13 }}>{ch.label}</Text>
                  <Text style={{ color: c.ink500, fontSize: 10, marginTop: 2 }}>
                    {ch.memberCount} member{ch.memberCount === 1 ? "" : "s"} ·{" "}
                    {ch.mode === "TEMPORARY" ? ch.remaining : "permanent"}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
