import type { LocationFix } from "./outbox";

export type LocationStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

/** Send a fix when there is none yet, when the phone has moved this far, or when this long has passed. */
export const MOVE_THRESHOLD_M = 25;
export const MIN_MOVE_INTERVAL_MS = 10_000;
export const HEARTBEAT_MS = 30_000;

export function distanceMeters(a: Pick<LocationFix, "lat" | "lng">, b: Pick<LocationFix, "lat" | "lng">): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function shouldSend(lastSent: LocationFix | null, fix: LocationFix): boolean {
  if (!lastSent) return true;
  const elapsed = fix.at - lastSent.at;
  if (elapsed <= 0) return false;
  if (elapsed >= HEARTBEAT_MS) return true;
  return elapsed >= MIN_MOVE_INTERVAL_MS && distanceMeters(lastSent, fix) >= MOVE_THRESHOLD_M;
}

export interface TrackerOptions {
  onFix: (fix: LocationFix) => void;
  onStatus: (status: LocationStatus) => void;
  geolocation?: Geolocation;
}

/**
 * Follows the phone's position while an alert is running. The watch fires
 * when the position changes; `refresh()` asks for a fresh fix when the phone is
 * standing still, so the tracking page still sees a recent timestamp.
 */
export class LocationTracker {
  private watchId: number | null = null;
  private readonly geo: Geolocation | undefined;

  constructor(private readonly opts: TrackerOptions) {
    this.geo = opts.geolocation ?? (typeof navigator !== "undefined" ? navigator.geolocation : undefined);
  }

  start() {
    if (this.watchId !== null) return;
    if (!this.geo) return this.opts.onStatus("unavailable");
    this.opts.onStatus("locating");
    this.watchId = this.geo.watchPosition(this.handleFix, this.handleError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });
  }

  refresh() {
    if (!this.geo || this.watchId === null) return;
    this.geo.getCurrentPosition(this.handleFix, this.handleError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 20_000,
    });
  }

  stop() {
    if (this.watchId !== null && this.geo) this.geo.clearWatch(this.watchId);
    this.watchId = null;
    this.opts.onStatus("idle");
  }

  private handleFix = (pos: GeolocationPosition) => {
    if (this.watchId === null) return;
    this.opts.onStatus("ok");
    this.opts.onFix({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      at: pos.timestamp || Date.now(),
    });
  };

  private handleError = (err: GeolocationPositionError) => {
    if (this.watchId === null) return;
    // A timeout just means no fix yet; keep watching.
    if (err.code === 1) this.opts.onStatus("denied");
    else if (err.code === 2) this.opts.onStatus("unavailable");
  };
}
