import { useEffect, useState } from "react";
import { Image, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { getDriveItem, mediaUrl, trashDriveItem, updateDriveItem, type DriveItem } from "../../src/api";
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

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="Back to Drive" variant="ghost" onPress={() => router.replace("/drive")} />
          <Button label="Move to trash" variant="ghost" onPress={trash} />
        </View>
      </ScrollView>
    </Screen>
  );
}
