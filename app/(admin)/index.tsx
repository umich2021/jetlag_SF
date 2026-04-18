import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import {
    getNeighborhoods,
    getNeighborhoodTotals,
    getTeams,
    subscribeToCaptainLocations,
    subscribeToNeighborhoods,
} from "../../lib/gameapi";
import { supabase } from "../../lib/supabase";
import { getCentroid, parseWKT } from "../../utils/wktParser";

const SF_CENTER = {
  latitude: 37.7749,
  longitude: -122.4394,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const POLYGON_FILL_OPACITY = 0.45;
const DEFAULT_COLOR = "#888888";
const CHALLENGE_ICONS: Record<string, string> = {
  fixed: "📌",
  variable: "⚡",
  steal: "💀",
};

type Neighborhood = {
  id: string;
  name: string;
  wkt: string;
  controlled_by_team_id: string | null;
  teams: any;
};

type Challenge = {
  id: string;
  title: string;
  type: string;
  coordinate_lat: number;
  coordinate_lng: number;
  is_completed: boolean;
};

type NeighborhoodModal = {
  neighborhood: Neighborhood;
  totals: {
    team_id: string;
    total_coins: number;
    teams: { name: string; color: string };
  }[];
};

function getTeam(teams: any) {
  if (!teams) return null;
  return Array.isArray(teams) ? teams[0] : teams;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function AdminMapScreen() {
  const mapRef = useRef<MapView>(null);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [captainLocations, setCaptainLocations] = useState<Record<string, any>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [showCoins, setShowCoins] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [neighborhoodDeposits, setNeighborhoodDeposits] = useState<any[]>([]);
  const [infoModal, setInfoModal] = useState<NeighborhoodModal | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [neighborhoodRes, depositsRes] = await Promise.all([
      getNeighborhoods(),
      supabase
        .from("neighborhood_totals")
        .select("neighborhood_id, team_id, total_coins"),
      loadChallenges(),
    ]);
    if (neighborhoodRes.neighborhoods)
      setNeighborhoods(neighborhoodRes.neighborhoods);
    if (depositsRes.data) setNeighborhoodDeposits(depositsRes.data);
    const teamData = await getTeamsWithCount();
    setTeams(teamData);
    setLoading(false);
  }

  async function loadChallenges() {
    const { data } = await supabase
      .from("challenges")
      .select("id, title, type, coordinate_lat, coordinate_lng, is_completed")
      .eq("is_completed", false);
    if (data) setChallenges(data as Challenge[]);
  }

  async function getTeamsWithCount() {
    const { teams: rawTeams } = await getTeams();
    if (!rawTeams) return [];
    const { neighborhoods: rawN } = await getNeighborhoods();
    if (!rawN) return rawTeams;
    const counts: Record<string, number> = {};
    for (const n of rawN) {
      if (n.controlled_by_team_id) {
        counts[n.controlled_by_team_id] =
          (counts[n.controlled_by_team_id] || 0) + 1;
      }
    }
    return rawTeams.map((t: any) => ({
      ...t,
      neighborhoods_controlled: counts[t.id] || 0,
    }));
  }

  useEffect(() => {
    const neighborhoodChannel = subscribeToNeighborhoods((_updated: any) => {
      getNeighborhoods().then(({ neighborhoods: fresh }) => {
        if (fresh) setNeighborhoods(fresh);
      });
      getTeamsWithCount().then(setTeams);
    });
    const locationChannel = subscribeToCaptainLocations((updated: any) => {
      setCaptainLocations((prev) => ({ ...prev, [updated.team_id]: updated }));
    });
    return () => {
      neighborhoodChannel.unsubscribe();
      locationChannel.unsubscribe();
    };
  }, []);

  async function handleNeighborhoodPress(neighborhood: Neighborhood) {
    const { totals } = await getNeighborhoodTotals(neighborhood.id);
    const sorted = (totals ?? []).sort(
      (a: any, b: any) => b.total_coins - a.total_coins,
    );
    setInfoModal({ neighborhood, totals: sorted });
  }

  const parsedNeighborhoods = useMemo(
    () =>
      neighborhoods.map((n) => {
        const allDeposits = neighborhoodDeposits.filter(
          (d) => d.neighborhood_id === n.id,
        );
        const sorted = allDeposits.sort(
          (a, b) => b.total_coins - a.total_coins,
        );
        const leaderTotal = sorted[0]?.total_coins ?? 0;
        return {
          ...n,
          polygons: parseWKT(n.wkt),
          color: getTeam(n.teams)?.color ?? DEFAULT_COLOR,
          leaderTotal,
        };
      }),
    [neighborhoods, neighborhoodDeposits],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>⚙️</Text>
        <Text style={styles.headerTitle}>Admin Map</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => setShowCoins((v) => !v)}
        >
          <Text style={styles.btnText}>
            {showCoins ? "🪙 Hide" : "🪙 Show"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={loadData}>
          <Text style={styles.btnText}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View
        style={[
          { height: mapFullscreen ? "100%" : 320 },
          mapFullscreen && {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          },
        ]}
      >
        {loading ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator color="#ff6b35" size="large" />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={SF_CENTER}
            showsUserLocation={false}
          >
            {parsedNeighborhoods.map((neighborhood) =>
              neighborhood.polygons.map((coords, ringIndex) => {
                const centroid = getCentroid(coords);
                return (
                  <React.Fragment key={`${neighborhood.id}-${ringIndex}`}>
                    <Polygon
                      coordinates={coords}
                      fillColor={hexToRgba(
                        neighborhood.color,
                        POLYGON_FILL_OPACITY,
                      )}
                      strokeColor={neighborhood.color}
                      strokeWidth={2}
                      tappable
                      onPress={() => handleNeighborhoodPress(neighborhood)}
                    />
                    {ringIndex === 0 &&
                      showCoins &&
                      neighborhood.leaderTotal > 0 && (
                        <Marker
                          key={`coin-${neighborhood.id}-${showCoins}`}
                          coordinate={centroid}
                          anchor={{ x: 0.5, y: 0.5 }}
                          tracksViewChanges={false}
                          onPress={() => handleNeighborhoodPress(neighborhood)}
                        >
                          <View style={styles.coinLabel}>
                            <Text style={styles.coinText}>
                              {neighborhood.leaderTotal > 0
                                ? `${neighborhood.leaderTotal} Coins`
                                : "No bids"}
                            </Text>
                          </View>
                        </Marker>
                      )}
                  </React.Fragment>
                );
              }),
            )}

            {challenges
              .filter((c) => c.coordinate_lat && c.coordinate_lng)
              .map((challenge) => (
                <Marker
                  key={challenge.id}
                  coordinate={{
                    latitude: challenge.coordinate_lat,
                    longitude: challenge.coordinate_lng,
                  }}
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges={false}
                >
                  <View style={styles.challengePin}>
                    <Text style={styles.challengePinIcon}>
                      {CHALLENGE_ICONS[challenge.type] ?? "📌"}
                    </Text>
                    <View style={styles.challengePinLabel}>
                      <Text style={styles.challengePinText}>
                        {challenge.title}
                      </Text>
                    </View>
                  </View>
                </Marker>
              ))}

            {Object.values(captainLocations).map((loc: any) => (
              <Marker
                key={loc.team_id}
                coordinate={{
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View
                  style={[
                    styles.captainDot,
                    { backgroundColor: loc.teams?.color ?? "#888" },
                  ]}
                >
                  <View style={styles.captainDotInner} />
                </View>
              </Marker>
            ))}
          </MapView>
        )}
        <TouchableOpacity
          style={styles.fullscreenBtn}
          onPress={() => setMapFullscreen((v) => !v)}
        >
          <Text style={styles.fullscreenBtnText}>
            {mapFullscreen ? "⤓" : "⤢"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Teams list */}
      {!mapFullscreen && (
        <ScrollView
          style={styles.teamsList}
          contentContainerStyle={styles.teamsContent}
        >
          <Text style={styles.teamsHeader}>Teams</Text>
          {teams.map((team) => (
            <View key={team.id} style={styles.teamRow}>
              <View style={styles.teamLeft}>
                <View
                  style={[styles.teamColorDot, { backgroundColor: team.color }]}
                />
                <Text style={styles.teamName}>{team.name}</Text>
              </View>
              <View style={styles.teamStats}>
                <View style={styles.statPill}>
                  <Text style={styles.statIcon}>🏠</Text>
                  <Text style={styles.statValue}>
                    {team.neighborhoods_controlled ?? 0}
                  </Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statIcon}>🪙</Text>
                  <Text style={styles.statValue}>{team.coins_balance}</Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Neighborhood info modal (read only) */}
      <Modal
        visible={!!infoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setInfoModal(null)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Neighborhood</Text>
            <Text style={styles.modalNeighborhoodName}>
              {infoModal?.neighborhood.name}
            </Text>

            <View style={styles.modalDivider} />

            <Text style={styles.modalLabel}>Controlled by</Text>
            <Text style={styles.modalValue}>
              {getTeam(infoModal?.neighborhood.teams)?.name ?? "Uncontrolled"}
            </Text>

            <Text style={styles.modalLabel}>Deposits by team</Text>
            {infoModal?.totals.length === 0 && (
              <Text style={styles.modalValue}>No bids yet</Text>
            )}
            {infoModal?.totals.map((t) => (
              <View key={t.team_id} style={styles.depositRow}>
                <View
                  style={[
                    styles.teamColorDot,
                    { backgroundColor: t.teams?.color ?? "#888" },
                  ]}
                />
                <Text style={styles.depositTeamName}>
                  {t.teams?.name ?? "Unknown"}
                </Text>
                <Text style={styles.depositAmount}>{t.total_coins} coins</Text>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#333",
  },
  headerIcon: { fontSize: 20 },
  headerTitle: { fontSize: 18, fontWeight: "600", color: "#fff", flex: 1 },
  btn: {
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnText: { fontSize: 12, fontWeight: "600", color: "#ccc" },
  mapContainer: { height: 320 },
  map: { flex: 1 },
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a1a",
  },
  fullscreenBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 8,
    zIndex: 10,
  },
  fullscreenBtnText: { fontSize: 18 },
  coinLabel: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  coinText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  challengePin: { alignItems: "center" },
  challengePinIcon: { fontSize: 22 },
  challengePinLabel: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  challengePinText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  captainDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  captainDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  teamsList: { flex: 1, backgroundColor: "#111" },
  teamsContent: { padding: 16, paddingBottom: 32 },
  teamsHeader: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  teamLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  teamColorDot: { width: 12, height: 12, borderRadius: 6 },
  teamName: { fontSize: 15, fontWeight: "500", color: "#fff" },
  teamStats: { flexDirection: "row", gap: 12 },
  statPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  statIcon: { fontSize: 14 },
  statValue: { fontSize: 14, fontWeight: "600", color: "#ccc" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBox: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    borderWidth: 1,
    borderColor: "#333",
  },
  modalClose: { position: "absolute", top: 14, right: 14, padding: 4 },
  modalCloseText: { fontSize: 16, color: "#666" },
  modalTitle: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalNeighborhoodName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    marginTop: 4,
    marginBottom: 12,
  },
  modalDivider: { height: 1, backgroundColor: "#2a2a2a", marginBottom: 12 },
  modalLabel: { fontSize: 12, color: "#666", marginBottom: 6, marginTop: 8 },
  modalValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  depositRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  depositTeamName: { fontSize: 14, color: "#ccc", flex: 1 },
  depositAmount: { fontSize: 14, fontWeight: "700", color: "#ff6b35" },
});
