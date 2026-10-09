import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import {
  createDriveItem,
  importTeraboxLink,
  zohoConnectUrl,
  zohoCreate,
  zohoList,
  zohoStatus,
  uploadToWorkDrive,
  uploadLargeToWorkDrive,
  type ZohoStatus,
  linkTerabox,
  listDrive,
  listLinkedAccounts,
  unlinkAccount,
  uploadToDrive,
  type DriveItem,
  type DriveKind,
  type LinkedAccount
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
  const [tb, setTb] = useState<LinkedAccount | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [tbLoaded, setTbLoaded] = useState(false);
  const [tbLabel, setTbLabel] = useState("");
  const [tbToken, setTbToken] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [zoho, setZoho] = useState<ZohoStatus | null>(null);
  const [zohoFiles, setZohoFiles] = useState<{ id: string; name: string; permalink?: string }[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await listDrive(parentId);
      setItems(d.items ?? []);
    } catch {
      setError("Sign in to use your drive.");
    }
  }, [parentId]);

  const loadTerabox = useCallback(async () => {
    try {
      const d = await listLinkedAccounts();
      setTb((d.accounts ?? []).find((a) => a.provider === "TERABOX") ?? null);
      setOauthAvailable(Boolean(d.terabox?.oauthAvailable));
    } catch {
      // signed out
    }
    setTbLoaded(true);
  }, []);

  const loadZoho = useCallback(async () => {
    try {
      setZoho(await zohoStatus());
    } catch {
      // signed out
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      await loadTerabox();
      await loadZoho();
      setLoading(false);
    })();
  }, [load, loadTerabox, loadZoho]);

  async function zohoMake(kind: "SHEET" | "DOC" | "SLIDES") {
    setBusy("ZOHO");
    setError(null);
    try {
      const d = await zohoCreate(kind);
      setNotice(`Created "${d.item.name}" in WorkDrive.`);
      await load();
    } catch {
      setError("Could not create that in Zoho.");
    }
    setBusy(null);
  }

  async function zohoUpload() {
    setBusy("ZUP");
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      for (const a of res.assets) {
        const info = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream", size: a.size ?? 0 };
        // Big files stream straight from disk; small ones go the simple way.
        if (info.size > 250 * 1024 * 1024) await uploadLargeToWorkDrive(info, parentId);
        else await uploadToWorkDrive({ uri: info.uri, name: info.name, mimeType: info.mimeType }, parentId);
      }
      setNotice("Uploaded to WorkDrive.");
      await load();
    } catch {
      setError("Upload to WorkDrive failed.");
    }
    setBusy(null);
  }

  async function zohoShowFiles() {
    setBusy("ZLIST");
    try {
      const d = await zohoList();
      setZohoFiles(d.files ?? []);
    } catch {
      setError("Could not read WorkDrive.");
    }
    setBusy(null);
  }

  async function linkTb() {
    setBusy("TB");
    setError(null);
    try {
      await linkTerabox({ label: tbLabel, token: tbToken.trim() });
      setTbToken("");
      setNotice("Terabox linked.");
      await loadTerabox();
    } catch {
      setError("Could not link Terabox. Check the session token.");
    }
    setBusy(null);
  }

  async function unlinkTb() {
    if (!tb) return;
    setBusy("TB");
    try {
      await unlinkAccount(tb.id);
      setTb(null);
      setNotice("Terabox disconnected.");
    } catch {
      setError("Could not disconnect.");
    }
    setBusy(null);
  }

  async function importShare() {
    setBusy("IMPORT");
    setError(null);
    try {
      await importTeraboxLink(shareUrl, parentId);
      setShareUrl("");
      setNotice("Added to your drive.");
      await load();
    } catch {
      setError("That is not a Terabox link.");
    }
    setBusy(null);
  }

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
          {notice ? <Text style={{ color: c.brand700, fontSize: 12, marginTop: 8 }}>{notice}</Text> : null}
        </Card>

        {zoho ? (
          <Card>
            <Heading>Zoho WorkDrive</Heading>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <Pill label={zoho.linked ? "linked" : "not linked"} active={zoho.linked} />
              <Pill label={zoho.dc === "in" ? "India data centre" : `DC: ${zoho.dc}`} />
            </View>
            {!zoho.configured ? (
              <Text style={{ color: c.ink500, fontSize: 12, marginTop: 8 }}>
                Zoho is not set up on this server. Register a client at api-console.zoho.{zoho.dc} and set
                ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET.
              </Text>
            ) : !zoho.linked ? (
              <>
                <Text style={{ color: c.ink500, fontSize: 12, marginTop: 8 }}>
                  Connect Zoho WorkDrive to create documents, sheets and slides there, and upload files into it.
                </Text>
                <View style={{ marginTop: 10 }}>
                  <Button label="Connect Zoho WorkDrive" onPress={() => Linking.openURL(zohoConnectUrl())} />
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: c.ink500, fontSize: 12, marginTop: 8 }}>
                  Linked to {zoho.account?.label}. New files land in your Zoho My Folders.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <Button label={busy === "ZOHO" ? "..." : "New sheet"} onPress={() => zohoMake("SHEET")} disabled={busy !== null} />
                  <Button label="New document" variant="ghost" onPress={() => zohoMake("DOC")} disabled={busy !== null} />
                  <Button label="New slides" variant="ghost" onPress={() => zohoMake("SLIDES")} disabled={busy !== null} />
                  <Button label={busy === "ZUP" ? "Uploading..." : "Upload to WorkDrive"} variant="ghost" onPress={zohoUpload} disabled={busy !== null} />
                  <Button label={busy === "ZLIST" ? "Reading..." : "Show WorkDrive files"} variant="ghost" onPress={zohoShowFiles} disabled={busy !== null} />
                </View>
                {zohoFiles ? (
                  <View style={{ marginTop: 10, gap: 4 }}>
                    {zohoFiles.length === 0 ? (
                      <Text style={{ color: c.ink500, fontSize: 12 }}>Your WorkDrive folder is empty.</Text>
                    ) : (
                      zohoFiles.map((f) => (
                        <Pressable key={f.id} onPress={() => f.permalink && Linking.openURL(f.permalink)}>
                          <Text style={{ color: c.brand700, fontSize: 13 }}>{f.name}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </>
            )}
          </Card>
        ) : null}

        {tbLoaded ? (
          <Card>
            <Heading>Terabox</Heading>
            {tb ? (
              <>
                <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
                  Linked{tb.label ? ` as ${tb.label}` : ""} via {tb.method === "OAUTH" ? "Terabox sign-in" : "session token"}
                  {tb.tokenHint ? ` (${tb.tokenHint})` : ""}.
                </Text>
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: c.ink500, fontSize: 12 }}>Paste a Terabox share link</Text>
                  <TextInput
                    style={{ borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 10, color: c.ink900, marginTop: 6 }}
                    placeholder="https://www.terabox.com/s/..."
                    placeholderTextColor={c.ink500}
                    value={shareUrl}
                    onChangeText={setShareUrl}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <Button label={busy === "IMPORT" ? "Adding..." : "Add to my drive"} onPress={importShare} disabled={busy !== null || shareUrl.trim().length < 6} />
                  <Button label="Disconnect" variant="ghost" onPress={unlinkTb} disabled={busy !== null} />
                </View>
                <Text style={{ color: c.ink500, fontSize: 11, marginTop: 8 }}>
                  This saves a pointer, not a copy - the file stays on Terabox.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: c.ink500, fontSize: 12, marginTop: 4 }}>
                  Link your Terabox account to keep its share links in your drive.
                </Text>
                <Text style={{ color: c.ink700, fontSize: 13, marginTop: 8 }}>
                  1. Create a free Terabox account at terabox.com
                </Text>
                <Text style={{ color: c.ink700, fontSize: 13, marginTop: 4 }}>
                  2. Connect it below.
                </Text>
                {oauthAvailable ? (
                  <Text style={{ color: c.ink500, fontSize: 11, marginTop: 4 }}>
                    Official sign-in is available on this server.
                  </Text>
                ) : (
                  <Text style={{ color: "#b45309", fontSize: 11, marginTop: 6 }}>
                    Unofficial path: Terabox has no open sign-in for ordinary users, so paste the ndus session token
                    from a signed-in browser. It may stop working and may not be allowed by their terms. Stored encrypted;
                    we never ask for your password.
                  </Text>
                )}
                <TextInput
                  style={{ borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 10, color: c.ink900, marginTop: 8 }}
                  placeholder="Account name (optional)"
                  placeholderTextColor={c.ink500}
                  value={tbLabel}
                  onChangeText={setTbLabel}
                />
                <TextInput
                  style={{ borderColor: c.line, borderWidth: 1, borderRadius: 8, padding: 10, color: c.ink900, marginTop: 8 }}
                  placeholder="ndus session token"
                  placeholderTextColor={c.ink500}
                  value={tbToken}
                  onChangeText={setTbToken}
                />
                <View style={{ marginTop: 10 }}>
                  <Button label={busy === "TB" ? "Linking..." : "Link Terabox"} onPress={linkTb} disabled={busy !== null || tbToken.trim().length < 16} />
                </View>
              </>
            )}
          </Card>
        ) : null}

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
