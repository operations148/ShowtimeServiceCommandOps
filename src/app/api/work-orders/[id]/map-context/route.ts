import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { resolvePropertyCoords, getTechnicianLastLocation } from "@/lib/db/queries/geo-context";
import { isTechLocationEnabled } from "@/lib/geo/flags";
import { db } from "@/lib/db/client";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]/map-context
//
// Property coordinates (geocoded on-demand, cached) + the assigned
// technician's last-known position for the work-order map. Dispatch-level
// (canViewSchedule) — technicians don't see each other's positions. The map
// is a nice-to-have, so partial data (property but no tech, or vice versa) is
// returned rather than erroring.
// ---------------------------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canViewSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const wo = await getWorkOrderById(id, tenantId);
  if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

  const property = await resolvePropertyCoords(wo.property_id, tenantId).catch(() => null);

  let technician: {
    technician_id: string; name: string | null;
    latitude: number; longitude: number; accuracy_m: number | null; recorded_at: string;
  } | null = null;

  if (isTechLocationEnabled() && wo.assigned_technician_id) {
    const loc = await getTechnicianLastLocation(wo.assigned_technician_id, tenantId).catch(() => null);
    if (loc) {
      const { data: tech } = await db
        .from("technicians").select("name").eq("id", wo.assigned_technician_id).eq("tenant_id", tenantId).maybeSingle();
      technician = {
        technician_id: loc.technician_id,
        name: (tech as { name?: string } | null)?.name ?? null,
        latitude: loc.latitude, longitude: loc.longitude, accuracy_m: loc.accuracy_m, recorded_at: loc.recorded_at,
      };
    }
  }

  return NextResponse.json({
    data: {
      property: property
        ? { latitude: property.latitude, longitude: property.longitude, address: wo.property_address, customer_name: wo.property_customer_name }
        : null,
      technician,
      location_enabled: isTechLocationEnabled(),
    },
  });
}
