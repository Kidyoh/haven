/**
 * Distance and direction between two points, computed on the phone. Nothing
 * here touches the network: where the user is, and where they are going, stay
 * on the device.
 */

export interface Point {
  lat: number;
  lng: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b, 0–360°, 0 = north. */
export function bearingDegrees(a: Point, b: Point): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export const COMPASS_POINTS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Nearest of the eight compass points. */
export function compassPoint(bearing: number): CompassPoint {
  return COMPASS_POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/** "350 m", "1.2 km", "14 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

/** Rough walking time at 4.5 km/h along a path ~1.3× the straight line. Minutes. */
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round((meters * 1.3) / 75));
}

export function hasCoordinates(c: { lat: number | null; lng: number | null }): c is Point {
  return typeof c.lat === "number" && typeof c.lng === "number";
}
