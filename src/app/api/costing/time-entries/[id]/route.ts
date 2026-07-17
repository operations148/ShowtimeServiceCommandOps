import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getTimeEntryById, updateTimeEntry, deleteTimeEntry } from "@/lib/db/queries/costing";
import { serializeTimeEntries } from "@/lib/costing/serialize";
import { canViewCosts, canModifyEntry } from "@/lib/costing/authorize";
import { UpdateTimeEntrySchema } from "@/lib/validation/costing";

type RouteContext = { params: Promise<{ id: string }> };
const NOT_FOUND = "Time entry not found";

// PATCH /api/costing/time-entries/[id] — edit minutes/notes on your OWN entry
// (owners may edit anyone's). Re-prices against the entry's FROZEN rate, never
// today's rate (ADR-0016 §1). Both queries and the rollup are handled in the
// query layer.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const existing = await getTimeEntryById(id, tenantId);
  // Same generic 404 whether it's missing or not yours — no existence oracle.
  if (!existing || !canModifyEntry(auth.session, { technicianId: existing.technician_id, createdBy: existing.created_by })) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UpdateTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const updated = await updateTimeEntry(id, parsed.data, tenantId);
    if (!updated) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const [serialized] = serializeTimeEntries([updated], canViewCosts(auth.session));
    return NextResponse.json({ data: serialized });
  } catch (err) {
    console.error("[api] PATCH time-entry:", err);
    const message = err instanceof RangeError ? err.message : "Failed to update time entry";
    return NextResponse.json({ error: message }, { status: err instanceof RangeError ? 422 : 500 });
  }
}

// DELETE /api/costing/time-entries/[id] — triggers a cost recompute.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const existing = await getTimeEntryById(id, tenantId);
  if (!existing || !canModifyEntry(auth.session, { technicianId: existing.technician_id, createdBy: existing.created_by })) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  try {
    await deleteTimeEntry(id, tenantId);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[api] DELETE time-entry:", err);
    return NextResponse.json({ error: "Failed to delete time entry" }, { status: 500 });
  }
}
