import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { captainLogin } from "../lib/gameapi";

const ADMIN_PASSWORD = "1337";

export default function LoginScreen() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!password.trim()) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);

    if (password === ADMIN_PASSWORD) {
      setLoading(false);
      router.replace("/admin" as any);
      return;
    }

    // match by password only
    const { team, error: loginError } = await captainLogin(password);
    setLoading(false);

    if (loginError) {
      setError(loginError);
      return;
    }

    router.replace({
      pathname: "/(tabs)" as any,
      params: {
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        coinsBalance: team.coins_balance,
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        {/* Header */}
        <Text style={styles.icon}>🚆</Text>
        <Text style={styles.title}>SF Control</Text>
        <Text style={styles.subtitle}>Enter your team credentials</Text>

        {/* Inputs */}
        <View style={styles.form}>
          {/* <Text style={styles.label}>Team Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Red Team"
            placeholderTextColor="#666"
            value={teamName}
            onChangeText={setTeamName}
            autoCapitalize="words"
            returnKeyType="next"
          /> */}

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        {/* Error */}
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Enter</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  // Header
  icon: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 40,
  },

  // Form
  form: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#fff",
    marginBottom: 20,
  },

  // Error
  error: {
    color: "#E24B4A",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },

  // Button
  button: {
    backgroundColor: "#4a9eff",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
