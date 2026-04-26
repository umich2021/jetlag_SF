import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  depositCoins,
  getNeighborhoods,
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
  const [neighborhoods, setNeighborhoods] = useState<any[]>([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<any>(null);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidding, setBidding] = useState(false);
  // Add these states
  const [neighborhoodSearch, setNeighborhoodSearch] = useState("");
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { neighborhoods: n } = await getNeighborhoods();
    if (n) setNeighborhoods(n);
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
  async function handleAdminBid() {
    if (!selectedNeighborhood || !selectedTeam) {
      Alert.alert("Missing", "Select a neighborhood and team.");
      return;
    }
    const amount = parseInt(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid", "Enter a valid amount.");
      return;
    }
    setBidding(true);
    const { error } = await depositCoins(
      selectedTeam.id,
      selectedNeighborhood.id,
      amount,
    );
    setBidding(false);
    if (error) {
      Alert.alert("Error", String(error));
      return;
    }
    setBidAmount("");
    setSelectedNeighborhood(null);
    setSelectedTeam(null);
    Alert.alert(
      "Done",
      `Deposited ${amount} coins for ${selectedTeam.name} in ${selectedNeighborhood.name}`,
    );
    loadData();
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
      {/* Place Bid on Behalf of Team */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Place Bid on Behalf of Team</Text>

        <Text style={styles.modalSectionLabel}>Neighborhood</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setShowNeighborhoodPicker(true)}
        >
          <Text style={styles.dropdownBtnText}>
            {selectedNeighborhood?.name ?? "Select neighborhood..."}
          </Text>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>

        <Text style={styles.modalSectionLabel}>Team</Text>
        <TouchableOpacity
          style={styles.dropdownBtn}
          onPress={() => setShowTeamPicker(true)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {selectedTeam && (
              <View
                style={[
                  styles.teamDot,
                  { backgroundColor: selectedTeam.color },
                ]}
              />
            )}
            <Text style={styles.dropdownBtnText}>
              {selectedTeam?.name ?? "Select team..."}
            </Text>
          </View>
          <Text style={styles.dropdownArrow}>▼</Text>
        </TouchableOpacity>

        <View style={styles.adjustRow}>
          <TextInput
            style={styles.adjustInput}
            placeholder="Amount"
            placeholderTextColor="#555"
            keyboardType="number-pad"
            value={bidAmount}
            onChangeText={setBidAmount}
          />
          <TouchableOpacity
            style={[
              styles.adjustBtn,
              styles.addBtn,
              bidding && { opacity: 0.5 },
            ]}
            onPress={handleAdminBid}
            disabled={bidding}
          >
            {bidding ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.adjustBtnText}>Deposit</Text>
            )}
          </TouchableOpacity>
        </View>

        {selectedNeighborhood && selectedTeam && (
          <Text style={styles.hint}>
            Depositing for {selectedTeam.name} in {selectedNeighborhood.name}
          </Text>
        )}
      </View>

      {/* Neighborhood picker modal */}
      <Modal visible={showNeighborhoodPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerBox}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Neighborhood</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowNeighborhoodPicker(false);
                  setNeighborhoodSearch("");
                }}
              >
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.pickerSearch}
              placeholder="Search..."
              placeholderTextColor="#555"
              value={neighborhoodSearch}
              onChangeText={setNeighborhoodSearch}
              autoFocus
            />
            <FlatList
              data={neighborhoods.filter((n) =>
                n.name.toLowerCase().includes(neighborhoodSearch.toLowerCase()),
              )}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedNeighborhood?.id === item.id &&
                      styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    setSelectedNeighborhood(item);
                    setShowNeighborhoodPicker(false);
                    setNeighborhoodSearch("");
                  }}
                >
                  <Text style={styles.pickerItemText}>{item.name}</Text>
                  {selectedNeighborhood?.id === item.id && (
                    <Text style={styles.pickerItemCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Team picker modal */}
      <Modal visible={showTeamPicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerBox}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Team</Text>
              <TouchableOpacity onPress={() => setShowTeamPicker(false)}>
                <Text style={styles.pickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={teams}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    selectedTeam?.id === item.id && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    setSelectedTeam(item);
                    setShowTeamPicker(false);
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={[styles.teamDot, { backgroundColor: item.color }]}
                    />
                    <Text style={styles.pickerItemText}>{item.name}</Text>
                  </View>
                  {selectedTeam?.id === item.id && (
                    <Text style={styles.pickerItemCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  selectBtn: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#444",
  },
  selectBtnActive: {
    borderColor: "#ff6b35",
    borderWidth: 2,
  },
  selectBtnText: { color: "#ccc", fontSize: 13 },
  teamSelectRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  modalSectionLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dropdownBtn: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dropdownBtnText: { color: "#ccc", fontSize: 14, flex: 1 },
  dropdownArrow: { color: "#666", fontSize: 12 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  pickerBox: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    borderWidth: 1,
    borderColor: "#333",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  pickerTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  pickerClose: { fontSize: 16, color: "#666", padding: 4 },
  pickerSearch: {
    backgroundColor: "#2a2a2a",
    margin: 12,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#444",
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  pickerItemActive: { backgroundColor: "#2a2a2a" },
  pickerItemText: { fontSize: 15, color: "#fff" },
  pickerItemCheck: { fontSize: 16, color: "#ff6b35" },
});
