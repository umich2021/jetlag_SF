import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

type Challenge = {
  id: string;
  title: string;
  description: string;
  type: "fixed" | "variable" | "steal";
  base_reward: number;
  final_reward: number;
  is_released: boolean;
  released_to_team_id: string | null;
  is_completed: boolean;
  completed_by_team_id: string | null;
  display_id: string | null; // ← add this
  is_hidden: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  fixed: "Reg",
  variable: "Var",
  steal: "Steal",
};

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{ teamId: string; teamColor: string }>();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // ── Load challenges ────────────────────────────────────────────────────────
  useEffect(() => {
    loadChallenges();
    const channel = subscribeToChallenges();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadChallenges() {
    setLoading(true);

    const { data: rewards } = await supabase
      .from("challenge_rewards")
      .select("id, title, base_reward, final_reward");

    const { data: details } = await supabase
      .from("challenges")
      .select(
        "id, display_id, description, type, is_hidden, is_completed, completed_by_team_id",
      );

    const flat: Challenge[] = (rewards ?? []).map((r: any) => {
      const detail = (details ?? []).find((d: any) => d.id === r.id);
      return {
        id: r.id,
        display_id: detail?.display_id ?? null,
        title: r.title,
        base_reward: r.base_reward,
        final_reward: r.final_reward,
        description: detail?.description ?? "",
        type: detail?.type ?? "fixed",
        is_hidden: detail?.is_hidden ?? false,
        is_completed: detail?.is_completed ?? false,
        completed_by_team_id: detail?.completed_by_team_id ?? null,
      };
    });

    setChallenges(sortChallenges(flat));
    setLoading(false);
  }

  // ── Realtime ───────────────────────────────────────────────────────────────
  function subscribeToChallenges() {
    return supabase
      .channel("challenges-screen")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenges" },
        () => loadChallenges(), // reload on any change
      )
      .subscribe();
  }

  // ── Sort: active first (by id), completed last ─────────────────────────────
  function sortChallenges(list: Challenge[]): Challenge[] {
    return [...list].sort((a, b) => {
      if (a.is_completed && !b.is_completed) return 1;
      if (!a.is_completed && b.is_completed) return -1;
      return a.id.localeCompare(b.id);
    });
  }

  // ── Filter by search ───────────────────────────────────────────────────────
  const filtered = challenges.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Render item ────────────────────────────────────────────────────────────
  const renderChallenge = ({ item }: { item: Challenge }) => {
    const isCompleted = item.is_completed;
    const typeLabel = TYPE_LABELS[item.type] ?? item.type;

    return (
      <View
        style={[
          styles.challengeRow,
          isCompleted && styles.challengeRowCompleted,
        ]}
      >
        <View style={styles.challengeHeader}>
          <Text
            style={[
              styles.challengeTitle,
              isCompleted && styles.challengeTitleStrikethrough,
            ]}
          >
            {item.display_id ? `${item.display_id}` : item.title}
          </Text>
          <View style={styles.rewardPill}>
            <Text style={styles.rewardText}>
              {typeLabel} {item.final_reward}
            </Text>
            <Text style={styles.coinIcon}>🪙</Text>
          </View>
        </View>

        {/* Description — visible unless admin hid it */}
        {!item.is_hidden && !isCompleted && (
          <View style={styles.descriptionBox}>
            <Text style={styles.challengeType}>Type-{typeLabel}</Text>
            <Text style={styles.descriptionText}>{item.description}</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Challenges</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍"
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#4a9eff" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderChallenge}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#d4966d",
  },

  // Header
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: "#eb7900",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: "#eb7900",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#fff",
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Challenge row
  challengeRow: {
    backgroundColor: "#ea823e",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ede3d3",
  },
  challengeRowCompleted: {
    opacity: 0.4,
  },
  challengeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  challengeTitleStrikethrough: {
    textDecorationLine: "line-through",
    color: "#000",
  },

  // Reward pill
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eb7900",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rewardText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  coinIcon: {
    fontSize: 13,
  },

  // Description box (shown when challenge released to this team)
  descriptionBox: {
    marginTop: 12,
    backgroundColor: "#eb7900",
    borderRadius: 8,
    padding: 12,
  },
  challengeName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  challengeType: {
    fontSize: 12,
    color: "#fff",
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: "#fff",
    lineHeight: 20,
  },
});
