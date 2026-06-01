/**
 * Geolocation Phase 1 — capture, evaluation, and per-session caching.
 *
 * The capture flow is intentionally graceful: failures never block the timer.
 * A null result means "no location captured for this entry" — UI must handle it.
 */

export type GeolocationMode = "off" | "ask" | "always";
export type ClientGeoOverride = "inherit" | "always" | "never";

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy_m: number;
}

export interface ClientSite {
  site_lat: number | null;
  site_lng: number | null;
  site_radius_m: number | null;
}

export interface OnSiteResult {
  on_site: boolean;
  distance_m: number;
}

const ACCURACY_RETRY_THRESHOLD_M = 100;

/**
 * Request a high-accuracy location fix. Retries once if first fix is too coarse.
 * Resolves null on any error or denial — never throws.
 */
export async function requestLocation(): Promise<CapturedLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  const getOnce = (): Promise<CapturedLocation | null> =>
    new Promise((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: Math.round(pos.coords.accuracy),
            }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
        );
      } catch {
        resolve(null);
      }
    });

  const first = await getOnce();
  if (!first) return null;
  if (first.accuracy_m <= ACCURACY_RETRY_THRESHOLD_M) return first;
  // Retry once for a better fix
  const second = await getOnce();
  if (!second) return first;
  return second.accuracy_m < first.accuracy_m ? second : first;
}

/** Haversine distance in meters between two coordinates. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Evaluate whether a captured fix lies inside the client's geofence.
 * Returns null when the client has no site set — caller should render raw coords instead.
 */
export function evaluateOnSite(
  location: CapturedLocation,
  client: ClientSite
): OnSiteResult | null {
  if (client.site_lat == null || client.site_lng == null) return null;
  const radius = client.site_radius_m ?? 100;
  const distance = Math.round(
    haversineMeters(location.lat, location.lng, client.site_lat, client.site_lng)
  );
  return { on_site: distance <= radius, distance_m: distance };
}

// ── Session cache (handoff between Start and Save) ───────────────────────────

const CACHE_KEY = "trace_geo_start";

interface CachedStart {
  mode: string;
  startedAt: string;
  location: CapturedLocation;
}

export function cacheStartLocation(mode: string, startedAt: string, loc: CapturedLocation) {
  try {
    const map = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CachedStart>;
    map[mode] = { mode, startedAt, location: loc };
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {}
}

export function readStartLocation(mode: string, startedAt: string | null): CapturedLocation | null {
  if (!startedAt) return null;
  try {
    const map = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CachedStart>;
    const hit = map[mode];
    if (!hit) return null;
    // Only valid for the matching session (start ISO must match)
    if (hit.startedAt !== startedAt) return null;
    return hit.location;
  } catch {
    return null;
  }
}

export function clearStartLocation(mode: string) {
  try {
    const map = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, CachedStart>;
    delete map[mode];
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {}
}

/** Format a (lat, lng) pair for compact display in exports. */
export function formatCoords(lat: number, lng: number, accuracy_m?: number | null): string {
  const base = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return accuracy_m != null ? `${base} (±${accuracy_m}m)` : base;
}

/** Build a Google Maps deep link for a coordinate pair. */
export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
