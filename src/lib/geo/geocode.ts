/**
 * Address → coordinates via OpenStreetMap Nominatim (Phase 12, ADR-0018).
 *
 * Server-only. Usage-policy compliant: identified User-Agent, ONE lookup per
 * property, results cached in properties.latitude/longitude (never bulk loops,
 * never re-geocoded unless the address changes). No API key, no billing.
 *
 * parseNominatim + buildAddressQuery are pure and unit-tested; geocodeAddress
 * is the thin network wrapper.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface AddressParts {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/** Pure. Builds a single-line query string, skipping empty parts. */
export function buildAddressQuery(a: AddressParts): string {
  return [a.address_line1, a.address_line2, a.city, a.state, a.zip]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Pure. Parses a Nominatim JSON array into a GeoPoint, or null if unusable. */
export function parseNominatim(raw: unknown): GeoPoint | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0] as { lat?: unknown; lon?: unknown };
  const latitude = typeof first.lat === "string" ? parseFloat(first.lat) : NaN;
  const longitude = typeof first.lon === "string" ? parseFloat(first.lon) : NaN;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOCODE_TIMEOUT_MS = 8_000;
// Nominatim policy requires a genuine identifying UA with contact info.
const USER_AGENT = "ServiceOps-Command-Center/1.0 (field-service ops; contact ops@serviceops.app)";

export type GeocodeResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; reason: "empty_address" | "not_found" | "error"; error?: string };

/** One on-demand geocode. Callers MUST cache the result — never call in a loop. */
export async function geocodeAddress(parts: AddressParts): Promise<GeocodeResult> {
  const q = buildAddressQuery(parts);
  if (!q) return { ok: false, reason: "empty_address" };

  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: "error", error: `HTTP ${res.status}` };
    const point = parseNominatim(await res.json());
    return point ? { ok: true, point } : { ok: false, reason: "not_found" };
  } catch (err) {
    return { ok: false, reason: "error", error: err instanceof Error ? err.message : "network error" };
  } finally {
    clearTimeout(timer);
  }
}
