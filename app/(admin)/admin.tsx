import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    adminAdjustCoins,
    adminGetTeams,
    adminSetMultiplier,
} from "../../lib/gameapi";
import { supabase } from "../../lib/supabase";

type Team = { id: string; name: string; color: string; coins_balance: number };

export default function AdminScreen() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [multiplier, setMultiplier] = useState("1.0");
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [teamRes, settingsRes] = await Promise.all([
      adminGetTeams(),
      supabase
        .from("game_settings")
        .select("global_coin_multiplier")
        .eq("id", 1)
        .single(),
    ]);
    if (teamRes.teams) setTeams(teamRes.teams);
    if (settingsRes.data) {
      setCurrentMultiplier(settingsRes.data.global_coin_multiplier);
      setMultiplier(String(settingsRes.data.global_coin_multiplier));
    }
    setLoading(false);
  }

  async function handleAdjust(teamId: string, add: boolean) {
    const raw = adjustAmounts[teamId];
    const amount = parseInt(raw);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid", "Enter a valid amount.");
      return;
    }
    const finalAmount = add ? amount : -amount;
    const { error } = await adminAdjustCoins(teamId, finalAmount);
    if (error) {
      Alert.alert("Error", String(error));
      return;
    }
    setAdjustAmounts((prev) => ({ ...prev, [teamId]: "" }));
    loadData();
  }

  async function handleSetMultiplier() {
    const val = parseFloat(multiplier);
    if (isNaN(val) || val <= 0) {
      Alert.alert("Invalid", "Enter a valid multiplier.");
      return;
    }
    setSaving(true);
    const { error } = await adminSetMultiplier(val);
    setSaving(false);
    if (error) {
      Alert.alert("Error", String(error));
      return;
    }
    setCurrentMultiplier(val);
    Alert.alert("Done", `Global multiplier set to ${val}x`);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#ff6b35" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Admin Panel</Text>

      {/* Global multiplier */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Global Challenge Multiplier</Text>
        <Text style={styles.sectionSubtitle}>
          Current: {currentMultiplier}x
        </Text>
        <View style={styles.multiplierRow}>
          <TextInput
            style={styles.multiplierInput}
            value={multiplier}
            onChangeText={setMultiplier}
            keyboardType="decimal-pad"
            placeholderTextColor="#666"
          />
          <Text style={styles.multiplierX}>x</Text>
          <TouchableOpacity
            style={[styles.setBtn, saving && { opacity: 0.5 }]}
            onPress={handleSetMultiplier}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.setBtnText}>Set</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          All challenge final rewards update instantly when you change this.
        </Text>
      </View>

      {/* Team coin adjustments */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Team Coins</Text>
        {teams.map((team) => (
          <View key={team.id} style={styles.teamCard}>
            <View style={styles.teamCardHeader}>
              <View style={[styles.teamDot, { backgroundColor: team.color }]} />
              <Text style={styles.teamName}>{team.name}</Text>
              <Text style={styles.teamBalance}>{team.coins_balance} 🪙</Text>
            </View>

            <View style={styles.adjustRow}>
              <TextInput
                style={styles.adjustInput}
                placeholder="Amount"
                placeholderTextColor="#555"
                keyboardType="number-pad"
                value={adjustAmounts[team.id] ?? ""}
                onChangeText={(v) =>
                  setAdjustAmounts((prev) => ({ ...prev, [team.id]: v }))
                }
              />
              <TouchableOpacity
                style={[styles.adjustBtn, styles.addBtn]}
                onPress={() => handleAdjust(team.id, true)}
              >
                <Text style={styles.adjustBtnText}>+ Add</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adjustBtn, styles.subtractBtn]}
                onPress={() => handleAdjust(team.id, false)}
              >
                <Text style={styles.adjustBtnText}>− Sub</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" },
  content: {
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f0f0f",
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 24,
  },

  section: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  sectionSubtitle: { fontSize: 13, color: "#ff6b35", marginBottom: 12 },

  multiplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  multiplierInput: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: "700",
    color: "#ff6b35",
    width: 80,
    borderWidth: 1,
    borderColor: "#444",
  },
  multiplierX: { fontSize: 20, color: "#666" },
  setBtn: {
    backgroundColor: "#ff6b35",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  setBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  hint: { fontSize: 12, color: "#555", lineHeight: 18 },

  teamCard: {
    backgroundColor: "#222",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  teamCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  teamDot: { width: 12, height: 12, borderRadius: 6 },
  teamName: { fontSize: 15, fontWeight: "600", color: "#fff", flex: 1 },
  teamBalance: { fontSize: 15, fontWeight: "700", color: "#ff6b35" },

  adjustRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  adjustInput: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#444",
  },
  adjustBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addBtn: { backgroundColor: "#2d5a1b" },
  subtractBtn: { backgroundColor: "#5a1b1b" },
  adjustBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
