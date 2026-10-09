import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  createDriveItem,
  listDrive,
  uploadToDrive,
  type DriveItem,
  type DriveKind
} from "../src/api";
import { Button, Card, Empty, Heading, Loading, Pill, Screen, useColors } from "../src/ui";

const NEW_ITEMS: { kind: DriveKind; label: string }[] = [
  { kind: "FOLDER", label: "New folder" },
  { kind: "NOTE", label: "New note" },
  { kind: "SHEET", label: "New sheet" },
  { kind: "DOC", label: "New document" },
  { kind: "SLIDES", label: "New slides" }
];

function humanSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export default function DriveScreen() {
  const c = useColors();
  const router = useRouter();
  const { folder } = useLocalSearchParams<{ folder?: string }>();
  const parentId = typeof folder === "string" && folder ? folder : null;

  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await listDrive(parentId);
      setItems(d.items ?? []);
    } catch {
      setError("Sign in to use your drive.");
    }
  }, [parentId]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function create(kind: DriveKind) {
    setBusy(kind);
    setError(null);
    try {
      const d = await createDriveItem(kind, parentId);
      router.push(`/drive/${d.item.id}`);
    } catch {
      setError("Could not create that.");
    }
    setBusy(null);
  }

  async function upload() {
    setBusy("UPLOAD");
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      for (const asset of res.assets) {
        await uploadToDrive(
          {
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType ?? "application/octet-stream",
            size: asset.size ?? 0
          },
          parentId
        );
      }
      await load();
    } catch {
      setError("Upload failed.");
    }
    setBusy(null);
  }

  if (loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Card>
          <Heading>My Drive</Heading>
          <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
            Notes, sheets, documents, slides and any file you upload.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {NEW_ITEMS.map((n) => (
              <Button
                key={n.kind}
                label={busy === n.kind ? "..." : n.label}
                variant="ghost"
                disabled={busy !== null}
                onPress={() => create(n.kind)}
              />
            ))}
            <Button label={busy === "UPLOAD" ? "Uploading..." : "Upload a file"} disabled={busy !== null} onPress={upload} />
          </View>
          {error ? <Text style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>{error}</Text> : null}
        </Card>

        {items.length === 0 ? (
          <Empty text="Nothing here yet." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  item.kind === "FOLDER"
                    ? router.push(`/drive?folder=${item.id}`)
                    : router.push(`/drive/${item.id}`)
                }
                style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ color: c.ink900, fontWeight: "500", flex: 1 }}>{item.name}</Text>
                  <Pill label={item.kind.toLowerCase()} />
                </View>
                <Text style={{ color: c.ink500, fontSize: 11, marginTop: 2 }}>
                  {item.mimeType || item.kind.toLowerCase()}
                  {item.sizeBytes ? ` - ${humanSize(item.sizeBytes)}` : ""}
                </Text>
              </Pressable>
            )}
          />
        )}
      </ScrollView>
    </Screen>
  );
}
