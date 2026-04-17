import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from "react-native-maps";

import { CHALLENGES, NEIGHBORHOODS } from "../../data/neighborhoods.js";
import { getCentroid, parseWKT } from "../../utils/wktParser";

// Opacity for polygon fills (0–1)
const POLYGON_FILL_OPACITY = 0.45;

// SF city center — default camera position
const SF_CENTER = {
  latitude: 37.7749,
  longitude: -122.4394,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function MapScreen() {
  const mapRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Parse all neighborhood WKT strings once on mount
  const parsedNeighborhoods = NEIGHBORHOODS.map((n) => ({
    ...n,
    polygons: parseWKT(n.wkt), // array of coordinate arrays
  }));

  // ── Location permission + tracking ─────────────────────────────────────────
  useEffect(() => {
    let subscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied");
        return;
      }

      // Watch position continuously
      subscription = await Location.watchPositionAsync(
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
    })();

    return () => subscription?.remove();
  }, []);

  // ── Recenter button ─────────────────────────────────────────────────────────
  const handleRecenter = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          ...userLocation,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        600,
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🚆</Text>
        <Text style={styles.headerTitle}>SF Control</Text>
      </View>

      {/* ── Map ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={SF_CENTER}
        showsUserLocation={false} // we render our own marker for multi-user support
        showsMyLocationButton={false}
      >
        {/* Neighborhood polygons + coin labels */}
        {parsedNeighborhoods.map((neighborhood) =>
          neighborhood.polygons.map((coords, ringIndex) => {
            const centroid = getCentroid(coords);
            const isFirstRing = ringIndex === 0;

            return (
              <React.Fragment key={`${neighborhood.id}-${ringIndex}`}>
                {/* Filled polygon */}
                <Polygon
                  coordinates={coords}
                  fillColor={hexToRgba(
                    neighborhood.color,
                    POLYGON_FILL_OPACITY,
                  )}
                  strokeColor={neighborhood.color}
                  strokeWidth={2}
                />

                {/* Coin label — only on the first (exterior) ring */}
                {isFirstRing && (
                  <Marker
                    coordinate={centroid}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    <View style={styles.coinLabel}>
                      <Text style={styles.coinText}>
                        {neighborhood.coins} Coins
                      </Text>
                    </View>
                    <Text style={styles.NeighborText}>{neighborhood.name}</Text>
                  </Marker>
                )}
              </React.Fragment>
            );
          }),
        )}

        {/* Challenge pins */}
        {CHALLENGES.map((challenge) => (
          <Marker
            key={challenge.id}
            coordinate={challenge.coordinate}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={styles.challengePin}>
              <Text style={styles.challengeText}>{challenge.label}</Text>
              <View style={styles.challengeTail} />
            </View>
          </Marker>
        ))}

        {/* Current user location marker */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.userDot}>
              <View style={styles.userDotInner} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Recenter button ── */}
      {userLocation && (
        <TouchableOpacity style={styles.recenterBtn} onPress={handleRecenter}>
          <Text style={styles.recenterIcon}>◎</Text>
        </TouchableOpacity>
      )}

      {/* ── Location error toast ── */}
      {locationError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{locationError}</Text>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a hex color + alpha to an rgba string that react-native-maps accepts.
 * e.g. hexToRgba("#7B5EA7", 0.45) => "rgba(123, 94, 167, 0.45)"
 */
function hexToRgba(hex, alpha) {
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
    backgroundColor: "#111",
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
    zIndex: 10,
  },
  headerIcon: {
    fontSize: 22,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111",
    letterSpacing: -0.3,
  },

  // Map
  map: {
    flex: 1,
  },

  // Coin label (floating over polygon centroid)
  coinLabel: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  coinText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  NeighborText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  // Challenge pin
  challengePin: {
    alignItems: "center",
  },
  challengeText: {
    backgroundColor: "#1a1a2e",
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    overflow: "hidden",
    letterSpacing: 0.3,
    borderWidth: 1.5,
    borderColor: "#4a9eff",
  },
  challengeTail: {
    width: 2,
    height: 10,
    backgroundColor: "#4a9eff",
  },

  // User location dot
  userDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(74, 158, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(74, 158, 255, 0.5)",
  },
  userDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4a9eff",
  },

  // Recenter button
  recenterBtn: {
    position: "absolute",
    bottom: 32,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recenterIcon: {
    fontSize: 20,
    color: "#4a9eff",
  },

  // Error banner
  errorBanner: {
    position: "absolute",
    bottom: 32,
    left: 16,
    right: 72,
    backgroundColor: "rgba(200, 50, 50, 0.9)",
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
});
