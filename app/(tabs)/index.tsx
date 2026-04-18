import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";

import {
  getNeighborhoods,
  getTeams,
  subscribeToCaptainLocations,
  subscribeToNeighborhoods,
  updateCaptainLocation,
} from "../../lib/gameapi";
import { getCentroid, parseWKT } from "../../utils/wktParser";

const SF_CENTER = {
  latitude: 37.7749,
  longitude: -122.4394,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const POLYGON_FILL_OPACITY = 0.45;
const DEFAULT_NEIGHBORHOOD_COLOR = "#888888";
const LOCATION_UPDATE_INTERVAL = 5000;

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
  teams: { id: string; name: string; color: string } | null;
};

type CaptainLocation = {
  team_id: string;
  latitude: number;
  longitude: number;
  teams: { name: string; color: string } | null;
};

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

  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [captainLocations, setCaptainLocations] = useState<
    Record<string, CaptainLocation>
  >({});
  const [userLocation, setUserLocation] = useState<Coordinate | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [neighborhoodRes, teamRes] = await Promise.all([
      getNeighborhoods(),
      getTeamsWithNeighborhoodCount(),
    ]);
    // console.log("neighborhoods:", JSON.stringify(neighborhoodRes));
    // console.log("teams:", JSON.stringify(teamRes));
    if (neighborhoodRes.neighborhoods)
      setNeighborhoods(neighborhoodRes.neighborhoods);
    if (teamRes) setTeams(teamRes);
    setLoading(false);
  }

  // ── Neighborhood count per team ────────────────────────────────────────────
  async function getTeamsWithNeighborhoodCount(): Promise<Team[]> {
    const { teams: rawTeams } = await getTeams();
    if (!rawTeams) return [];

    const { neighborhoods: rawNeighborhoods } = await getNeighborhoods();
    if (!rawNeighborhoods) return rawTeams;

    // Count how many neighborhoods each team controls
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

  // ── Location tracking ──────────────────────────────────────────────────────
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
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        },
      );

      // Push location to Supabase every 5 seconds
      locationIntervalRef.current = setInterval(async () => {
        if (userLocation) {
          await updateCaptainLocation(
            params.teamId,
            userLocation.latitude,
            userLocation.longitude,
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

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    // Neighborhood control changes → update polygon colors
    const neighborhoodChannel = subscribeToNeighborhoods((updated) => {
      setNeighborhoods((prev) =>
        prev.map((n) =>
          n.id === updated.id
            ? {
                ...n,
                controlled_by_team_id: updated.controlled_by_team_id,
                teams: updated.teams,
              }
            : n,
        ),
      );
      // Refresh team neighborhood counts
      getTeamsWithNeighborhoodCount().then((t) => setTeams(t));
    });

    // Captain location updates → move dots on map
    const locationChannel = subscribeToCaptainLocations((updated) => {
      setCaptainLocations((prev) => ({
        ...prev,
        [updated.team_id]: updated,
      }));
    });

    return () => {
      neighborhoodChannel.unsubscribe();
      locationChannel.unsubscribe();
    };
  }, []);

  // ── Parsed neighborhoods ───────────────────────────────────────────────────
  const parsedNeighborhoods = neighborhoods.map((n) => ({
    ...n,
    polygons: parseWKT(n.wkt),
    color: n.teams?.color ?? DEFAULT_NEIGHBORHOOD_COLOR,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🚆</Text>
        <Text style={styles.headerTitle}>SF Control</Text>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
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
            {/* Neighborhood polygons */}
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
                    />
                    {ringIndex === 0 && (
                      <Marker
                        coordinate={centroid}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                      >
                        <View style={styles.coinLabel}>
                          <Text style={styles.coinText}>30 Coins</Text>
                        </View>
                      </Marker>
                    )}
                  </React.Fragment>
                );
              }),
            )}

            {/* Other captain location dots */}
            {Object.values(captainLocations)
              .filter((loc) => loc.team_id !== params.teamId)
              .map((loc) => (
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

            {/* Current user dot */}
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
              {/* Team color dot + name */}
              <View style={styles.teamLeft}>
                <View
                  style={[styles.teamColorDot, { backgroundColor: team.color }]}
                />
                <Text style={styles.teamName}>{team.name}</Text>
              </View>

              {/* Neighborhoods controlled + coin balance */}
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
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  headerIcon: { fontSize: 22, marginRight: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111",
    letterSpacing: -0.3,
  },

  // Map
  mapContainer: {
    height: 320,
  },
  map: { flex: 1 },
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a1a",
  },

  // Coin label
  coinLabel: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  coinText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Captain dots
  captainDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.85,
  },
  captainDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.9)",
  },

  // Teams list
  teamsList: {
    flex: 1,
    backgroundColor: "#fff",
  },
  teamsContent: {
    padding: 16,
    paddingBottom: 32,
  },
  teamsHeader: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 12,
    textAlign: "center",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f7f7f7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  teamLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  teamName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111",
  },
  teamStats: {
    flexDirection: "row",
    gap: 12,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statIcon: { fontSize: 14 },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
});
