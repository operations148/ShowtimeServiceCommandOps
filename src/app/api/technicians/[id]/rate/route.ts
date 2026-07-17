import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";
import { UpdateTechnicianRateSchema } from "@/lib/validation/costing";
import { recordAuditEvent } from "@/lib/security/audit";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/technicians/[id]/rate
//
// Current burdened hourly cost, for the edit panel's rate field. Same strict
// permission as writing it — this is compensation-adjacent data, so even
// reading it is owner-only (canManageJobCosting), not general technician-edit.
// ---------------------------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canManageJobCosting");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const { data, error } = await db
    .from("technicians")
    .select("id, hourly_cost_cents")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    console.error("[api] GET technician rate:", error.message);
    return NextResponse.json({ error: "Failed to load rate" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Technician not found" }, { status: 404 });

  return NextResponse.json({
    data: { hourly_cost_cents: (data as { hourly_cost_cents?: number }).hourly_cost_cents ?? 0 },
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/technicians/[id]/rate
//
// A technician's BURDENED hourly cost. Deliberately its own route rather than a
// field on the general technician update: this is compensation-adjacent data on
// a stricter permission (canManageJobCosting) than ordinary technician edits,
// and it must be audited.
//
// Forward-only by design — existing time_entries keep the rate frozen at the
// moment they were logged, so raising a rate never rewrites historical margin
// (ADR-0016 §1).
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canManageJobCosting");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UpdateTechnicianRateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const { data, error } = await db
    .from("technicians")
    .update({ hourly_cost_cents: parsed.data.hourly_cost_cents })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, name, hourly_cost_cents")
    .maybeSingle();
  if (error) {
    console.error("[api] PATCH technician rate:", error.message);
    return NextResponse.json({ error: "Failed to update rate" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Technician not found" }, { status: 404 });

  await recordAuditEvent({
    tenantId, userId, actionType: "costing.technician_rate_updated",
    description: `Updated burdened hourly cost for technician ${(data as { name: string }).name}`,
    entityType: "technician", entityId: id,
  });

  return NextResponse.json({ data });
}
