import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from "react-native";
import type { Colors } from "./theme";

export const ThemeContext = createContext<Colors | null>(null);

export function useColors(): Colors {
  const c = useContext(ThemeContext);
  if (!c) throw new Error("ThemeContext missing");
  return c;
}

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ flex: 1, backgroundColor: c.canvas }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View
      style={[
        { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 14 },
        style
      ]}
    >
      {children}
    </View>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.brand100,
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <Text style={{ color: c.brand700, fontWeight: "600", fontSize: size * 0.4 }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "solid",
  disabled
}: {
  label: string;
  onPress: () => void;
  variant?: "solid" | "ghost";
  disabled?: boolean;
}) {
  const c = useColors();
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: solid ? c.brand600 : c.brand50,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1
      }}
    >
      <Text style={{ color: solid ? "#fff" : c.brand700, fontWeight: "500", fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, active }: { label: string; active?: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: active ? c.brand100 : c.canvas,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 5,
        paddingHorizontal: 12
      }}
    >
      <Text style={{ color: active ? c.brand700 : c.ink700, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ padding: 24, alignItems: "center" }}>
      <ActivityIndicator color={c.brand600} />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return <Text style={{ color: c.ink500, padding: 16 }}>{text}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.ink900, fontSize: 22, fontWeight: "600" }}>{children}</Text>;
}
