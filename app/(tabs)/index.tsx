import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";

import {
  depositCoins,
  getNeighborhoods,
  getNeighborhoodTotals,
  getTeams,
  subscribeToCaptainLocations,
  subscribeToNeighborhoods,
  updateCaptainLocation,
} from "../../lib/gameapi";
import { supabase } from "../../lib/supabase";
import { getCentroid, isNearPolygon, parseWKT } from "../../utils/wktParser";
import { styles } from "./index.styles";

// ── Types ─────────────────────────────────────────────────────────────────────

type Coordinate = { latitude: number; longitude: number };

type Team = {
  id: string;
  name: string;
  color: string;
  coins_balance: number;
  neighborhoods_controlled?: number;
};

type Neighborhood = {
  id: string;
  name: string;
  wkt: string;
  controlled_by_team_id: string | null;
  teams:
    | { id: string; name: string; color: string }
    | { id: string; name: string; color: string }[]
    | null;
};

type Challenge = {
  id: string;
  title: string;
  type: "fixed" | "variable" | "steal";
  base_reward: number;
  coordinate_lat: number;
  coordinate_lng: number;
  is_completed: boolean;
};

type DepositModal = {
  neighborhood: Neighborhood;
  leaderTotal: number;
  leaderTeamName: string | null;
  myTotal: number;
  secondTotal: number;
  iControl: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SF_CENTER = {
  latitude: 37.7749,
  longitude: -122.4394,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const POLYGON_FILL_OPACITY = 0.45;
const DEFAULT_COLOR = "#888888";
const DEPOSIT_CAP_BUFFER = 10;
const LOCATION_UPDATE_INTERVAL = 5000;

const CHALLENGE_ICONS: Record<string, string> = {
  fixed: "✔️",
  variable: "❓",
  steal: "🥷",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const params = useLocalSearchParams<{
    teamId: string;
    teamName: string;
    teamColor: string;
    coinsBalance: string;
  }>();

  const mapRef = useRef<MapView>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const userLocationRef = useRef<Coordinate | null>(null);

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [captainLocations, setCaptainLocations] = useState<Record<string, any>>(
    {},
  );
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCoins, setShowCoins] = useState(true);

  const [depositModal, setDepositModal] = useState<DepositModal | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [myBalance, setMyBalance] = useState(
    parseInt(params.coinsBalance ?? "0"),
  );
  const [neighborhoodDeposits, setNeighborhoodDeposits] = useState<any[]>([]);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────
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
    const teamData = await getTeamsWithNeighborhoodCount();
    setTeams(teamData);
    setLoading(false);
  }

  async function loadChallenges(): Promise<void> {
    const { supabase } = await import("../../lib/supabase");
    const { data } = await supabase
      .from("challenges")
      .select(
        "id, title, type, base_reward, coordinate_lat, coordinate_lng, is_completed",
      )
      .eq("is_completed", false);
    if (data) setChallenges(data as Challenge[]);
  }

  async function getTeamsWithNeighborhoodCount(): Promise<Team[]> {
    const { teams: rawTeams } = await getTeams();
    if (!rawTeams) return [];
    const { neighborhoods: rawNeighborhoods } = await getNeighborhoods();
    if (!rawNeighborhoods) return rawTeams;
    const counts: Record<string, number> = {};
    for (const n of rawNeighborhoods) {
      if (n.controlled_by_team_id) {
        counts[n.controlled_by_team_id] =
          (counts[n.controlled_by_team_id] || 0) + 1;
      }
    }
    return rawTeams.map((t: Team) => ({
      ...t,
      neighborhoods_controlled: counts[t.id] || 0,
    }));
  }

  // ── Location ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!params.teamId) return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => {
          const coord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(coord);
          userLocationRef.current = coord;
        },
      );

      locationIntervalRef.current = setInterval(async () => {
        if (userLocationRef.current) {
          await updateCaptainLocation(
            params.teamId,
            userLocationRef.current.latitude,
            userLocationRef.current.longitude,
          );
        }
      }, LOCATION_UPDATE_INTERVAL);
    })();

    return () => {
      subscriptionRef.current?.remove();
      if (locationIntervalRef.current)
        clearInterval(locationIntervalRef.current);
    };
  }, [params.teamId]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const neighborhoodChannel = subscribeToNeighborhoods((updated: any) => {
      // refetch full data including team color instead of patching
      getNeighborhoods().then(({ neighborhoods: fresh }) => {
        if (fresh) setNeighborhoods(fresh);
      });
      getTeamsWithNeighborhoodCount().then(setTeams);
    });
    const locationChannel = subscribeToCaptainLocations((updated: any) => {
      setCaptainLocations((prev) => ({ ...prev, [updated.team_id]: updated }));
    });
    return () => {
      neighborhoodChannel.unsubscribe();
      locationChannel.unsubscribe();
    };
  }, []);

  // ── Deposit modal ────────────────────────────────────────────────────────────
  async function handleNeighborhoodPress(neighborhood: Neighborhood) {
    if (!userLocation) {
      Alert.alert("Location needed", "Waiting for your GPS location...");
      return;
    }

    const polygons = parseWKT(neighborhood.wkt);
    const isNear = polygons.some((coords) =>
      isNearPolygon(userLocation, coords, 150),
    );

    if (!isNear) {
      Alert.alert(
        "Too far away",
        "You need to be near this neighborhood to deposit coins.",
      );
      return;
    }

    const { totals } = await getNeighborhoodTotals(neighborhood.id);
    const sorted = (totals ?? []).sort(
      (a: any, b: any) => b.total_coins - a.total_coins,
    );
    const leader = sorted[0];
    const myEntry = (totals ?? []).find(
      (t: any) => t.team_id === params.teamId,
    );

    const leaderTotal = leader?.total_coins ?? 0;
    const secondTotal = sorted[1]?.total_coins ?? 0;
    const leaderTeamName = leader?.teams?.name ?? null;
    const myTotal = myEntry?.total_coins ?? 0;
    const iControl = neighborhood.controlled_by_team_id === params.teamId;

    setDepositAmount("");
    setDepositModal({
      neighborhood,
      leaderTotal,
      leaderTeamName,
      myTotal,
      iControl,
      secondTotal,
    });
  }

  function getDepositCap(modal: DepositModal): number {
    if (modal.iControl) {
      // defending — stay 10 ahead of second place
      return modal.secondTotal - modal.myTotal + DEPOSIT_CAP_BUFFER;
    } else {
      // attacking — beat the leader by up to 10
      return modal.leaderTotal + DEPOSIT_CAP_BUFFER - modal.myTotal;
    }
  }

  async function handleDeposit() {
    if (!depositModal) return;
    const amount = parseInt(depositAmount);
    const cap = getDepositCap(depositModal);

    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid number of coins.");
      return;
    }
    if (amount > cap) {
      Alert.alert("Too many coins", `Maximum deposit is ${cap} coins.`);
      return;
    }
    if (amount > myBalance) {
      Alert.alert("Not enough coins", `You only have ${myBalance} coins.`);
      return;
    }

    setDepositing(true);
    const { error } = await depositCoins(
      params.teamId,
      depositModal.neighborhood.id,
      amount,
    );
    setDepositing(false);

    if (error) {
      Alert.alert("Error", error);
      return;
    }

    setMyBalance((prev) => prev - amount);
    setDepositModal(null);
    getTeamsWithNeighborhoodCount().then(setTeams);
  }

  // ── Parsed neighborhoods ────────────────────────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}></Text>
        <Text style={styles.headerTitle}>Muni Mayhem</Text>
        <TouchableOpacity onPress={loadData} style={styles.toggleBtn}>
          <Text style={styles.toggleBtnText}>↺ Refresh</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setShowCoins((v) => !v)}
        >
          <Text style={styles.toggleBtnText}>
            {showCoins ? "🪙 Hide" : "🪙 Show"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={[styles.mapContainer, mapFullscreen && { height: "100%" }]}>
        <TouchableOpacity
          style={styles.fullscreenBtn}
          onPress={() => setMapFullscreen((v) => !v)}
        >
          <Text style={styles.fullscreenBtnText}>
            {mapFullscreen ? "X" : "⤢"}
          </Text>
        </TouchableOpacity>
        {loading ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator color="#4a9eff" size="large" />
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={SF_CENTER}
            showsUserLocation={false}
            showsMyLocationButton={false}
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

            {/* Challenge pins */}
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

            {/* Other captains */}
            {Object.values(captainLocations)
              .filter((loc: any) => loc.team_id !== params.teamId)
              .map((loc: any) => (
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

            {/* My dot */}
            {userLocation && (
              <Marker
                coordinate={userLocation}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View
                  style={[
                    styles.captainDot,
                    { backgroundColor: params.teamColor ?? "#4a9eff" },
                  ]}
                >
                  <View style={styles.captainDotInner} />
                </View>
              </Marker>
            )}
          </MapView>
        )}
      </View>

      {/* Teams list */}
      <ScrollView
        style={styles.teamsList}
        contentContainerStyle={styles.teamsContent}
      >
        <Text style={styles.teamsHeader}>Teams</Text>
        {teams.map((team) => {
          const isMyTeam = team.id === params.teamId;
          return (
            <View
              key={team.id}
              style={[
                styles.teamRow,
                isMyTeam && { borderColor: team.color, borderWidth: 2 },
              ]}
            >
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
                  <Text style={styles.statValue}>
                    {isMyTeam ? myBalance : team.coins_balance}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Deposit Modal */}
      <Modal
        visible={!!depositModal}
        transparent
        animationType="fade"
        onRequestClose={() => setDepositModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setDepositModal(null)}
            >
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Neighborhood</Text>
            <Text style={styles.modalNeighborhoodName}>
              {depositModal?.neighborhood.name}
            </Text>

            <View style={styles.modalDivider} />

            <Text style={styles.modalLabel}>Team Ownership</Text>
            <Text style={styles.modalValue}>
              {depositModal?.neighborhood.teams?.name ?? "Uncontrolled"}
            </Text>

            <Text style={styles.modalLabel}>Current Deposit</Text>
            <Text style={styles.modalValue}>
              {depositModal?.leaderTotal ?? 0} coins
              {depositModal?.leaderTeamName
                ? ` by ${depositModal.leaderTeamName}`
                : ""}
            </Text>
            {depositModal?.secondTotal > 0 && (
              <Text style={styles.modalLabel}>
                Second place:{" "}
                <Text style={styles.modalValue}>
                  {depositModal.secondTotal} coins
                </Text>
              </Text>
            )}
            <Text style={styles.modalLabel}>
              Our team coins: {depositModal?.myTotal ?? 0} coins(You)
            </Text>

            <Text style={styles.modalLabel}>
              Max deposit:{" "}
              <Text style={styles.modalCap}>
                {depositModal ? getDepositCap(depositModal) : 0} coins
              </Text>
            </Text>
            <Text style={styles.modalBalance}>
              Your balance: {myBalance} 🪙
            </Text>

            <View style={styles.modalInputRow}>
              <TextInput
                style={styles.modalInput}
                placeholder="Amount"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                value={depositAmount}
                onChangeText={setDepositAmount}
              />
              <Text style={styles.modalCoinsLabel}>Coins</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalSubmit, depositing && { opacity: 0.5 }]}
              onPress={handleDeposit}
              disabled={depositing}
            >
              {depositing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// helper at the bottom of the file
function getTeam(
  teams: any,
): { id: string; name: string; color: string } | null {
  if (!teams) return null;
  return Array.isArray(teams) ? teams[0] : teams;
}
