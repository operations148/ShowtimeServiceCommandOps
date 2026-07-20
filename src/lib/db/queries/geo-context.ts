import { db } from "@/lib/db/client";
import { geocodeAddress, type GeoPoint } from "@/lib/geo/geocode";

/**
 * Geo reads for the work-order map (Phase 12, ADR-0018). Property coordinates
 * are lazily geocoded once and cached on the row; technician location is the
 * single last-known row.
 */

export interface PropertyCoords extends GeoPoint {
  geocoded_at: string;
}

/**
 * Resolve a property's coordinates, geocoding on-demand (once) and caching the
 * result. Returns null if the address can't be geocoded — the caller shows no
 * map rather than a wrong pin. Never geocodes in a loop (one property per call).
 */
export async function resolvePropertyCoords(propertyId: string, tenantId: string): Promise<PropertyCoords | null> {
  const { data } = await db
    .from("properties")
    .select("latitude, longitude, geocoded_at, address_line1, address_line2, city, state, zip")
    .eq("id", propertyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    latitude: number | null; longitude: number | null; geocoded_at: string | null;
    address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; zip: string | null;
  };

  // Cache hit.
  if (row.latitude != null && row.longitude != null && row.geocoded_at != null) {
    return { latitude: row.latitude, longitude: row.longitude, geocoded_at: row.geocoded_at };
  }

  // Cache miss — geocode once and persist.
  const result = await geocodeAddress(row);
  if (!result.ok) return null;

  const geocoded_at = new Date().toISOString();
  await db
    .from("properties")
    .update({ latitude: result.point.latitude, longitude: result.point.longitude, geocoded_at })
    .eq("id", propertyId)
    .eq("tenant_id", tenantId);

  return { ...result.point, geocoded_at };
}

export interface TechLocationRow extends GeoPoint {
  technician_id: string;
  accuracy_m: number | null;
  recorded_at: string;
}

export async function getTechnicianLastLocation(technicianId: string, tenantId: string): Promise<TechLocationRow | null> {
  const { data } = await db
    .from("technician_locations")
    .select("technician_id, latitude, longitude, accuracy_m, recorded_at")
    .eq("technician_id", technicianId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as TechLocationRow | null) ?? null;
}

/** Upsert the caller's own last-known location (one row per technician). */
export async function upsertTechnicianLocation(input: {
  technicianId: string; tenantId: string; latitude: number; longitude: number; accuracyM?: number | null; recordedAt: string;
}): Promise<void> {
  const { error } = await db.from("technician_locations").upsert(
    {
      technician_id: input.technicianId,
      tenant_id: input.tenantId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_m: input.accuracyM ?? null,
      recorded_at: input.recordedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "technician_id" }
  );
  if (error) throw new Error(`[db] upsertTechnicianLocation: ${error.message}`);
}
