// Pure geometry helpers for "springs near this driving route". No D1/Worker
// dependency so these can be unit tested directly with node:test.

export interface RoutePoint {
  lat: number;
  lon: number;
}

/** Great-circle distance in miles between two points. */
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Reduce a dense route polyline down to at most `maxPoints` evenly-spaced
 * points, always keeping the first and last point. Directions APIs can return
 * routes with thousands of coordinate pairs; the near-route search only needs
 * enough samples to approximate the line within a mile or two.
 */
export function sampleRoute(points: RoutePoint[], maxPoints = 50): RoutePoint[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

/**
 * Distance from a point to the nearest sampled route point, plus that
 * point's index (so results can be sorted in route order — start to finish).
 *
 * This is a nearest-vertex approximation, not true point-to-segment distance.
 * It's accurate enough for a "within N miles of the route" corridor filter
 * once the route is sampled densely (every ~1-3 miles for a typical road
 * trip), but it can slightly over-report distance on long straight segments
 * between sparse samples. Upgrade path if that ever matters: real
 * point-to-segment projection, or a geometry library.
 */
export function nearestRoutePoint(
  lat: number,
  lon: number,
  route: RoutePoint[]
): { distanceMiles: number; index: number } {
  let best = { distanceMiles: Infinity, index: -1 };
  for (let i = 0; i < route.length; i++) {
    const d = haversineMiles(lat, lon, route[i].lat, route[i].lon);
    if (d < best.distanceMiles) best = { distanceMiles: d, index: i };
  }
  return best;
}

/** Bounding box covering all route points, padded by `paddingMiles` on each side. */
export function routeBoundingBox(route: RoutePoint[], paddingMiles: number) {
  const lats = route.map((p) => p.lat);
  const lons = route.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const latPad = paddingMiles / 69.0;
  const lonPad = paddingMiles / (69.0 * Math.cos((midLat * Math.PI) / 180));
  return {
    swLat: minLat - latPad,
    neLat: maxLat + latPad,
    swLon: minLon - lonPad,
    neLon: maxLon + lonPad,
  };
}

/** Parse the `points` query param: "lon,lat;lon,lat;..." -> RoutePoint[]. */
export function parseRoutePoints(raw: string): RoutePoint[] {
  return raw
    .split(';')
    .filter(Boolean)
    .map((pair) => {
      const [lonStr, latStr] = pair.split(',');
      const lon = Number(lonStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`Invalid route point: "${pair}"`);
      }
      return { lat, lon };
    });
}
