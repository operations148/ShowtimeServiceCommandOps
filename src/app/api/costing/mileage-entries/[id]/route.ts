import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getMileageEntryById, updateMileageEntry, deleteMileageEntry } from "@/lib/db/queries/costing";
import { serializeMileageEntries } from "@/lib/costing/serialize";
import { canViewCosts, canModifyEntry } from "@/lib/costing/authorize";
import { UpdateMileageEntrySchema } from "@/lib/validation/costing";

type RouteContext = { params: Promise<{ id: string }> };
const NOT_FOUND = "Mileage entry not found";

// PATCH /api/costing/mileage-entries/[id] — re-prices against the entry's
// FROZEN rate snapshot, never the tenant's current rate (ADR-0016 §1).
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const existing = await getMileageEntryById(id, tenantId);
  if (!existing || !canModifyEntry(auth.session, { technicianId: existing.technician_id, createdBy: existing.created_by })) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UpdateMileageEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const updated = await updateMileageEntry(id, parsed.data, tenantId);
    if (!updated) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const [serialized] = serializeMileageEntries([updated], canViewCosts(auth.session));
    return NextResponse.json({ data: serialized });
  } catch (err) {
    console.error("[api] PATCH mileage-entry:", err);
    const message = err instanceof RangeError ? err.message : "Failed to update mileage entry";
    return NextResponse.json({ error: message }, { status: err instanceof RangeError ? 422 : 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const existing = await getMileageEntryById(id, tenantId);
  if (!existing || !canModifyEntry(auth.session, { technicianId: existing.technician_id, createdBy: existing.created_by })) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  try {
    await deleteMileageEntry(id, tenantId);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[api] DELETE mileage-entry:", err);
    return NextResponse.json({ error: "Failed to delete mileage entry" }, { status: 500 });
  }
}
