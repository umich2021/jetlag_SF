/**
 * Parses WKT MULTIPOLYGON or POLYGON strings into react-native-maps coordinate arrays.
 *
 * Input example:
 *   MULTIPOLYGON (((-122.45 37.78, -122.44 37.79, ...)))
 *
 * Output: Array of coordinate arrays (one per polygon ring)
 *   [[{ latitude, longitude }, ...], ...]
 */
export function parseWKT(wkt) {
  if (!wkt || typeof wkt !== "string") return [];

  const cleaned = wkt.trim();

  if (cleaned.startsWith("MULTIPOLYGON")) {
    return parseMultiPolygon(cleaned);
  } else if (cleaned.startsWith("POLYGON")) {
    return [parsePolygon(cleaned)];
  }

  console.warn("parseWKT: unrecognized WKT type:", cleaned.slice(0, 40));
  return [];
}

function parseMultiPolygon(wkt) {
  // Strip "MULTIPOLYGON" and outer parens
  const inner = wkt.replace(/^MULTIPOLYGON\s*\(\s*/, "").replace(/\s*\)$/, "");

  // Each polygon looks like ((...),(...)). Split on polygon boundaries.
  const polygonStrings = splitPolygons(inner);

  const result = [];
  for (const polyStr of polygonStrings) {
    // Get only the exterior ring (first ring inside the polygon parens)
    const exteriorRing = extractFirstRing(polyStr);
    if (exteriorRing) {
      result.push(ringToCoords(exteriorRing));
    }
  }
  return result;
}

function parsePolygon(wkt) {
  const inner = wkt.replace(/^POLYGON\s*\(\s*/, "").replace(/\s*\)$/, "");
  const exteriorRing = extractFirstRing(inner);
  return exteriorRing ? ringToCoords(exteriorRing) : [];
}

/**
 * Splits a MULTIPOLYGON interior string into individual polygon strings.
 * Handles nested parens correctly.
 */
function splitPolygons(inner) {
  const polygons = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "(") {
      if (depth === 0) start = i;
      depth++;
    } else if (inner[i] === ")") {
      depth--;
      if (depth === 0 && start !== -1) {
        polygons.push(inner.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return polygons;
}

/**
 * Extracts the first ring's coordinate string from a polygon string like
 * "((-122.45 37.78, ...))" or "((-122.45 37.78, ...), (hole coords))"
 */
function extractFirstRing(polyStr) {
  // Remove outer parens
  const trimmed = polyStr.trim().replace(/^\(/, "").replace(/\)$/, "");
  // Find the first ring
  const match = trimmed.match(/\(([^)]+)\)/);
  return match ? match[1] : trimmed;
}

/**
 * Converts a coordinate string "lng lat, lng lat, ..." to
 * [{ latitude, longitude }, ...]
 */
function ringToCoords(ringStr) {
  return ringStr
    .split(",")
    .map((pair) => {
      const parts = pair.trim().split(/\s+/);
      if (parts.length < 2) return null;
      const longitude = parseFloat(parts[0]);
      const latitude = parseFloat(parts[1]);
      if (isNaN(latitude) || isNaN(longitude)) return null;
      return { latitude, longitude };
    })
    .filter(Boolean);
}

/**
 * Calculates the centroid of a coordinate array.
 * Used to position labels over polygons.
 */
export function getCentroid(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return { latitude: 0, longitude: 0 };
  }
  const total = coordinates.length;
  const sum = coordinates.reduce(
    (acc, coord) => ({
      latitude: acc.latitude + coord.latitude,
      longitude: acc.longitude + coord.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / total,
    longitude: sum.longitude / total,
  };
}
