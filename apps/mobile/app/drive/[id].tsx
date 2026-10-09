import { useEffect, useState } from "react";
import { Image, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import {
  createShare,
  getDriveItem,
  listShares,
  mediaUrl,
  revokeShare,
  trashDriveItem,
  updateDriveItem,
  type DriveItem,
  type DriveShare
} from "../../src/api";
import { Button, Card, Empty, Heading, Loading, Pill, Screen, useColors } from "../../src/ui";

export default function DriveItemScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<DriveItem | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [shares, setShares] = useState<DriveShare[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUser, setShareUser] = useState("");
  const [shareRole, setShareRole] = useState<"VIEWER" | "EDITOR">("VIEWER");

  useEffect(() => {
    (async () => {
      try {
        const d = await getDriveItem(String(id));
        setItem(d.item);
        setName(d.item.name);
        setContent(d.item.content);
      } catch {
        // not found
      }
      setLoading(false);
    })();
  }, [id]);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await updateDriveItem(String(id), { name, content });
      setStatus("Saved");
    } catch {
      setStatus("Could not save");
    }
    setBusy(false);
  }

  async function loadShares() {
    try {
      const d = await listShares(String(id));
      setShares(d.shares ?? []);
    } catch {
      // ignore
    }
  }

  async function shareWith() {
    const name = shareUser.trim();
    if (!name) return;
    setStatus(null);
    try {
      await createShare(String(id), { username: name, role: shareRole });
      setShareUser("");
      await loadShares();
      setStatus("Shared");
    } catch {
      setStatus("Could not share");
    }
  }

  async function makeLink() {
    setStatus(null);
    try {
      const d = await createShare(String(id), { public: true, role: shareRole });
      setStatus(d.share.link ? "Link ready" : "Link created");
      await loadShares();
    } catch {
      setStatus("Could not create a link");
    }
  }

  async function trash() {
    try {
      await trashDriveItem(String(id));
      router.replace("/drive");
    } catch {
      setStatus("Could not move to trash");
    }
  }

  if (loading) return <Screen><Loading /></Screen>;
  if (!item) return <Screen><Empty text="Item not found." /></Screen>;

  const editable = item.kind === "NOTE" || item.kind === "DOC" || item.kind === "SHEET" || item.kind === "SLIDES";
  const mime = item.mimeType || "";
  const url = item.storageKey ? mediaUrl(item.storageKey) : "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card>
          <TextInput
            style={{ color: c.ink900, fontSize: 18, fontWeight: "600" }}
            value={name}
            onChangeText={setName}
            onBlur={save}
          />
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <Pill label={item.kind.toLowerCase()} active />
            {status ? <Pill label={status} /> : null}
          </View>
        </Card>

        {editable ? (
          <Card>
            <TextInput
              multiline
              style={{ minHeight: 260, color: c.ink900, fontSize: 14, textAlignVertical: "top" }}
              value={content}
              onChangeText={setContent}
              placeholder={
                item.kind === "SHEET"
                  ? '{"cols":6,"rows":24,"cells":{}}'
                  : item.kind === "SLIDES"
                    ? '{"slides":[{"title":"","body":""}]}'
                    : "Write here..."
              }
            />
            <View style={{ marginTop: 10 }}>
              <Button label={busy ? "Saving..." : "Save"} onPress={save} disabled={busy} />
            </View>
          </Card>
        ) : null}

        {item.kind === "FILE" ? (
          <Card>
            {mime.startsWith("image/") ? (
              <Image source={{ uri: url }} style={{ height: 220, borderRadius: 8 }} resizeMode="contain" />
            ) : (
              <Text style={{ color: c.ink500, fontSize: 12 }}>
                {mime || "file"}
              </Text>
            )}
            <View style={{ marginTop: 10 }}>
              <Button label="Open with another app" variant="ghost" onPress={() => Linking.openURL(url)} />
            </View>
          </Card>
        ) : null}

        <Card>
          <Heading>Share</Heading>
          <View style={{ marginTop: 8 }}>
            <Button
              label={shareOpen ? "Hide sharing" : "Share this item"}
              variant="ghost"
              onPress={async () => {
                setShareOpen((o) => !o);
                if (!shareOpen) await loadShares();
              }}
            />
          </View>

          {shareOpen ? (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <TextInput
                  style={{ flex: 1, borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 10, color: c.ink900 }}
                  placeholder="username"
                  placeholderTextColor={c.ink500}
                  autoCapitalize="none"
                  value={shareUser}
                  onChangeText={setShareUser}
                />
                <Pressable onPress={() => setShareRole((r) => (r === "VIEWER" ? "EDITOR" : "VIEWER"))}>
                  <Pill label={shareRole === "VIEWER" ? "can view" : "can edit"} active />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Button label="Share" onPress={shareWith} />
                <Button label="Create a link" variant="ghost" onPress={makeLink} />
              </View>

              {shares.length === 0 ? (
                <Text style={{ color: c.ink500, fontSize: 12, marginTop: 10 }}>Not shared with anyone yet.</Text>
              ) : (
                shares.map((sh) => (
                  <View key={sh.id} style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 }}>
                    <Text style={{ color: c.ink900, fontSize: 13 }}>
                      {sh.user ? `@${sh.user.username}` : "Anyone with the link"} - {sh.role === "EDITOR" ? "can edit" : "can view"}
                    </Text>
                    {sh.link ? (
                      <Text style={{ color: c.brand700, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {sh.link}
                      </Text>
                    ) : null}
                    <Pressable onPress={async () => { await revokeShare(sh.id); await loadShares(); }} style={{ marginTop: 4 }}>
                      <Text style={{ color: "#dc2626", fontSize: 12 }}>Revoke</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Card>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Back to Drive" variant="ghost" onPress={() => router.replace("/drive")} />
          <Button label="Move to trash" variant="ghost" onPress={trash} />
        </View>
      </ScrollView>
    </Screen>
  );
}
