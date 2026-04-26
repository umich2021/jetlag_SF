import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
  adminFailChallenge,
  adminReleaseChallenge,
  getTeams
} from "../../lib/gameapi";
import { supabase } from "../../lib/supabase";

type Challenge = {
  id: string;
  title: string;
  description: string;
  type: string;
  base_reward: number;
  final_reward: number;
  is_released: boolean;
  released_to_team_id: string | null;
  released_to_team?: { name: string; color: string };
  is_completed: boolean;
  completed_by_team_id: string | null;
  failed_count: number;
  display_id: string | null;
  is_hidden: boolean;
};

type Team = { id: string; name: string; color: string };

const TYPE_LABELS: Record<string, string> = {
  fixed: "Reg",
  variable: "Var",
  steal: "Steal",
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "#378ADD" },
  hidden: { label: "Hidden", color: "#555" },
  completed: { label: "Completed", color: "#639922" },
};

export default function AdminChallengesScreen() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(
    null,
  );
  const [editedReward, setEditedReward] = useState("");
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("admin-challenges")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        loadData,
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadData() {
    setLoading(true);
    const [challengeRes, teamRes] = await Promise.all([
      loadChallenges(),
      getTeams(),
    ]);
    if (teamRes.teams) setTeams(teamRes.teams);
    setLoading(false);
  }

  async function loadChallenges() {
    // Get challenges with reward data
    const { data: rewards } = await supabase
      .from("challenge_rewards")
      .select("id, title, base_reward, final_reward, failed_count");

    const { data: details } = await supabase
      .from("challenges")
      .select(
        "id, display_id, is_hidden, description, type, is_released, released_to_team_id, is_completed, completed_by_team_id",
      );

    const { data: teamData } = await supabase
      .from("teams")
      .select("id, name, color");

    const flat: Challenge[] = (rewards ?? []).map((r: any) => {
      const detail = (details ?? []).find((d: any) => d.id === r.id);
      const releasedTeam = (teamData ?? []).find(
        (t: any) => t.id === detail?.released_to_team_id,
      );
      return {
        id: r.id,
        title: r.title,
        base_reward: r.base_reward,
        final_reward: r.final_reward,
        failed_count: r.failed_count,
        description: detail?.description ?? "",
        type: detail?.type ?? "fixed",
        is_released: detail?.is_released ?? false,
        released_to_team_id: detail?.released_to_team_id ?? null,
        released_to_team: releasedTeam,
        is_completed: detail?.is_completed ?? false,
        completed_by_team_id: detail?.completed_by_team_id ?? null,
        display_id: detail?.display_id ?? null,
        is_hidden: detail?.is_hidden ?? false,
      };
    });

    // Sort: unreleased → released → completed
    flat.sort((a, b) => {
      if (a.is_completed && !b.is_completed) return 1;
      if (!a.is_completed && b.is_completed) return -1;
      if (a.is_released && !b.is_released) return -1;
      if (!a.is_released && b.is_released) return 1;
      return 0;
    });

    setChallenges(flat);
  }

  function getStatus(c: Challenge) {
    if (c.is_completed) return "completed";
    if (c.is_hidden) return "hidden";
    return "active";
  }

  function openModal(challenge: Challenge) {
    setSelectedChallenge(challenge);
    setEditedReward(String(challenge.final_reward));
  }

  async function handleRelease(teamId: string) {
    if (!selectedChallenge) return;
    setActioning(true);
    const { error } = await adminReleaseChallenge(selectedChallenge.id, teamId);
    setActioning(false);
    if (error) {
      Alert.alert("Error", (error as any)?.message ?? JSON.stringify(error));
      return;
    }
    setSelectedChallenge(null);
    loadChallenges();
  }
  async function handleToggleHide() {
    if (!selectedChallenge) return;
    setActioning(true);
    const { error } = await supabase
      .from("challenges")
      .update({ is_hidden: !selectedChallenge.is_hidden })
      .eq("id", selectedChallenge.id);
    setActioning(false);
    if (error) {
      Alert.alert("Error", (error as any)?.message ?? JSON.stringify(error));
      return;
    }
    setSelectedChallenge(null);
    loadChallenges();
  }
  async function handleApprove() {
    if (!selectedChallenge) return;
    setActioning(true);
    const { error } = await supabase
      .from("challenges")
      .update({ is_completed: true })
      .eq("id", selectedChallenge.id);
    setActioning(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    setSelectedChallenge(null);
    loadChallenges();
  }

  async function handleFail() {
    if (!selectedChallenge) return;
    setActioning(true);
    const { error } = await adminFailChallenge(
      selectedChallenge.id,
      selectedChallenge.released_to_team_id!,
    );
    setActioning(false);
    if (error) {
      Alert.alert("Error", (error as any)?.message ?? JSON.stringify(error));
      return;
    }
    setSelectedChallenge(null);
    loadChallenges();
  }

  const renderChallenge = ({ item }: { item: Challenge }) => {
    const status = getStatus(item);
    const badge = STATUS_BADGE[status];
    return (
      <TouchableOpacity
        style={styles.challengeRow}
        onPress={() => openModal(item)}
      >
        <View style={styles.challengeHeader}>
          <Text style={styles.challengeTitle}>
            {item.display_id ?? "NA"} · {item.title}
          </Text>

          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.challengeMeta}>
          <Text style={styles.metaText}>
            {TYPE_LABELS[item.type] ?? item.type}
          </Text>
          <Text style={styles.metaText}>Base: {item.base_reward} 🪙</Text>
          <Text style={styles.metaText}>Final: {item.final_reward} 🪙</Text>
          {item.failed_count > 0 && (
            <Text style={styles.failedText}>❌ {item.failed_count} failed</Text>
          )}
        </View>

        {/* {item.is_released && item.released_to_team && (
          // <View style={styles.releasedTo}>
          //   <View
          //     style={[
          //       styles.teamDot,
          //       { backgroundColor: item.released_to_team.color },
          //     ]}
          //   />
          //   <Text style={styles.releasedToText}>
          //     Released to {item.released_to_team.name}
          //   </Text>
          // </View>
        )} */}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Challenges</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
          <Text style={styles.refreshBtnText}>↺</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#ff6b35" size="large" />
        </View>
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(item) => item.id}
          renderItem={renderChallenge}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Challenge action modal */}
      <Modal
        visible={!!selectedChallenge}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedChallenge(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
          >
            <View style={styles.modalBox}>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setSelectedChallenge(null)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>

              <Text style={styles.modalTitle}>{selectedChallenge?.title}</Text>
              <Text style={styles.modalDescription}>
                {selectedChallenge?.description}
              </Text>

              <View style={styles.modalDivider} />

              {/* Release section — only if not yet released */}
              {!selectedChallenge?.is_completed && (
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: selectedChallenge?.is_hidden
                        ? "#2d5a1b"
                        : "#555",
                      marginBottom: 12,
                    },
                  ]}
                  onPress={handleToggleHide}
                  disabled={actioning}
                >
                  <Text style={styles.actionBtnText}>
                    {selectedChallenge?.is_hidden
                      ? "👁 Show Description"
                      : "🙈 Hide Description"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Approve/fail section — only if released and not completed */}
              {/* Approve/fail section — if not completed */}
              {!selectedChallenge?.is_completed && (
                <>
                  <Text style={styles.modalSectionLabel}>Coin reward</Text>
                  <View style={styles.rewardRow}>
                    <TextInput
                      style={styles.rewardInput}
                      value={editedReward}
                      onChangeText={setEditedReward}
                      keyboardType="number-pad"
                      placeholderTextColor="#666"
                    />
                    <Text style={styles.rewardLabel}>
                      coins (default: {selectedChallenge?.final_reward})
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={handleApprove}
                      disabled={actioning}
                    >
                      {actioning ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.actionBtnText}>✅ Approve</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.failBtn]}
                      onPress={handleFail}
                      disabled={actioning}
                    >
                      {actioning ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.actionBtnText}>❌ Fail</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {selectedChallenge?.is_completed && (
                <Text style={styles.completedText}>
                  This challenge has been completed.
                </Text>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#1a1a1a",
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#fff", flex: 1 },
  refreshBtn: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshBtnText: { fontSize: 16, color: "#ccc" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16, gap: 10, paddingBottom: 32 },

  challengeRow: {
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  challengeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
    marginRight: 8,
  },
  strikethrough: { textDecorationLine: "line-through", color: "#555" },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  challengeMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  metaText: { fontSize: 12, color: "#888" },
  failedText: { fontSize: 12, color: "#E24B4A" },
  releasedTo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  teamDot: { width: 10, height: 10, borderRadius: 5 },
  releasedToText: { fontSize: 12, color: "#ff6b35" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalClose: { alignSelf: "flex-end", padding: 4, marginBottom: 8 },
  modalCloseText: { fontSize: 20, color: "#666" },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: "#888",
    lineHeight: 20,
    marginBottom: 12,
  },
  modalDivider: { height: 1, backgroundColor: "#2a2a2a", marginBottom: 16 },
  modalSectionLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  teamBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  teamBtnText: { fontSize: 15, color: "#fff", fontWeight: "500" },

  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  rewardInput: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: "700",
    color: "#ff6b35",
    width: 80,
    borderWidth: 1,
    borderColor: "#444",
  },
  rewardLabel: { fontSize: 13, color: "#666" },

  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  approveBtn: { backgroundColor: "#2d5a1b" },
  failBtn: { backgroundColor: "#5a1b1b" },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  completedText: {
    fontSize: 15,
    color: "#639922",
    textAlign: "center",
    marginTop: 8,
  },
});
