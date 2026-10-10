import { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { api } from "./api";
import { Button, useColors } from "./ui";
import {
  PRIMARY_ACTIONS,
  displayPatch,
  primaryActionHint,
  primaryActionLabel,
  togglesFor,
  type DisplayKey,
  type PostDisplay,
  type PrimaryAction
} from "./postDisplay";

/**
 * The mobile half of the post display menu - the same switches as the web
 * three-dot menu, in a bottom sheet. Every change is written at once; if the
 * write fails the switch goes back.
 */
export default function PostDisplaySheet({
  visible,
  onClose,
  initial,
  onSaved
}: {
  visible: boolean;
  onClose: () => void;
  initial: PostDisplay;
  onSaved?: (d: PostDisplay) => void;
}) {
  const c = useColors();
  const [display, setDisplay] = useState<PostDisplay>(initial);
  const [note, setNote] = useState<string | null>(null);

  async function save(next: PostDisplay, revert: PostDisplay) {
    setDisplay(next);
    setNote(null);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify(displayPatch(next)) });
      onSaved?.(next);
    } catch {
      setDisplay(revert);
      setNote("Could not save that.");
    }
  }

  function flip(key: DisplayKey) {
    void save({ ...display, [key]: !display[key] }, display);
  }

  // Focus mode is not a per-element toggle, so it gets its own handler rather
  // than being forced through DisplayKey.
  function flipFocus() {
    void save({ ...display, focusMode: !display.focusMode }, display);
  }

  function pick(action: PrimaryAction) {
    if (action === display.primaryAction) return;
    void save({ ...display, primaryAction: action }, display);
  }

  function Row({
    label,
    hint,
    value,
    onChange,
    dimmed
  }: {
    label: string;
    hint: string;
    value: boolean;
    onChange: () => void;
    dimmed?: boolean;
  }) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 10,
          borderBottomColor: c.line,
          borderBottomWidth: 1,
          opacity: dimmed ? 0.55 : 1
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink900, fontSize: 14 }}>{label}</Text>
          <Text style={{ color: c.ink500, fontSize: 12 }}>{hint}</Text>
        </View>
        <Switch value={value} onValueChange={onChange} />
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "85%",
            padding: 16
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ color: c.ink900, fontSize: 16, fontWeight: "600", flex: 1 }}>
              How your posts look
            </Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: c.brand700, fontSize: 14 }}>Done</Text>
            </Pressable>
          </View>
          <Text style={{ color: c.ink500, fontSize: 12, marginBottom: 12 }}>
            These apply everywhere, not just this post.
          </Text>
          {note && <Text style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{note}</Text>}

          <ScrollView>
            <Text style={{ color: c.ink500, fontSize: 11, fontWeight: "600", marginBottom: 6 }}>
              MAIN BUTTON
            </Text>
            {PRIMARY_ACTIONS.map((a) => (
              <Pressable
                key={a}
                onPress={() => pick(a)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 10,
                  borderBottomColor: c.line,
                  borderBottomWidth: 1
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: display.primaryAction === a ? c.brand600 : c.line,
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {display.primaryAction === a && (
                    <View
                      style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.brand600 }}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.ink900, fontSize: 14 }}>{primaryActionLabel(a, false)}</Text>
                  <Text style={{ color: c.ink500, fontSize: 12 }}>{primaryActionHint(a)}</Text>
                </View>
              </Pressable>
            ))}

            <Text style={{ color: c.ink500, fontSize: 11, fontWeight: "600", marginTop: 16, marginBottom: 6 }}>
              FOCUS MODE
            </Text>
            <Row
              label="Focus mode"
              hint="Hides every count at once, until you switch it off."
              value={display.focusMode}
              onChange={flipFocus}
            />

            <Text style={{ color: c.ink500, fontSize: 11, fontWeight: "600", marginTop: 16, marginBottom: 6 }}>
              WHAT TO SHOW
            </Text>
            {togglesFor("metadata").map((t) => (
              <Row
                key={t.key}
                label={t.label}
                hint={
                  display.focusMode && t.key !== "caption" ? "hidden by focus mode" : t.hint
                }
                value={display[t.key]}
                onChange={() => flip(t.key)}
                dimmed={display.focusMode && t.key !== "caption"}
              />
            ))}

            <Text style={{ color: c.ink500, fontSize: 11, fontWeight: "600", marginTop: 16, marginBottom: 6 }}>
              INTERFACE ELEMENTS
            </Text>
            {togglesFor("elements").map((t) => (
              <Row
                key={t.key}
                label={t.label}
                hint={t.hint}
                value={display[t.key]}
                onChange={() => flip(t.key)}
              />
            ))}

            <View style={{ height: 12 }} />
            <Button label="Close" onPress={onClose} variant="ghost" />
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
