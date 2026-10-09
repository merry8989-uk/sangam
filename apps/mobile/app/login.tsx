import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { signIn } from "../src/api";
import { Button, Card, Heading, Screen, useColors } from "../src/ui";

export default function Login() {
  const c = useColors();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace("/");
    } catch {
      setError("Could not sign in. Check your email and password.");
    }
    setBusy(false);
  }

  const input = {
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: c.ink900,
    backgroundColor: c.canvas
  } as const;

  return (
    <Screen>
      <View style={{ padding: 16 }}>
        <Card>
          <Heading>Sign in</Heading>
          <Text style={{ color: c.ink500, marginTop: 4, fontSize: 12 }}>
            Use the same account you created on the web.
          </Text>
          <TextInput
            style={{ ...input, marginTop: 12 }}
            placeholder="Email"
            placeholderTextColor={c.ink500}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={{ ...input, marginTop: 8 }}
            placeholder="Password"
            placeholderTextColor={c.ink500}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={{ color: "#dc2626", marginTop: 8 }}>{error}</Text> : null}
          <View style={{ marginTop: 12 }}>
            <Button label={busy ? "Signing in..." : "Sign in"} onPress={submit} disabled={busy} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
