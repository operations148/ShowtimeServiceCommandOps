import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listTimeEntries, createTimeEntry } from "@/lib/db/queries/costing";
import { serializeTimeEntries } from "@/lib/costing/serialize";
import { canViewCosts, canLogAgainstWorkOrder, resolveEntryTechnicianId } from "@/lib/costing/authorize";
import { CreateTimeEntrySchema } from "@/lib/validation/costing";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]/time-entries
//
// Readable by anyone who may log costs (technicians included) — but the rows
// are redacted server-side unless the caller has canViewJobCosting, so a
// technician sees minutes and never the rate or cost.
// ---------------------------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  if (!(await canLogAgainstWorkOrder(auth.session, id, tenantId))) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  try {
    const entries = await listTimeEntries(id, tenantId);
    return NextResponse.json({ data: serializeTimeEntries(entries, canViewCosts(auth.session)) });
  } catch (err) {
    console.error("[api] GET time-entries:", err);
    return NextResponse.json({ error: "Failed to load time entries" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/work-orders/[id]/time-entries
//
// The body carries minutes (or a timer range) — never a rate or a cost. The
// server prices the entry from the technician's server-held burdened rate.
// A technician-scoped caller can only log against themselves and only on a
// work order assigned to them.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = CreateTimeEntrySchema.safeParse({ ...(body as object), work_order_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  if (!(await canLogAgainstWorkOrder(auth.session, id, tenantId))) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const technicianId = resolveEntryTechnicianId(auth.session, parsed.data.technician_id);
  if (!technicianId) {
    return NextResponse.json({ error: "No technician to attribute this time to" }, { status: 422 });
  }

  try {
    const entry = await createTimeEntry(parsed.data, technicianId, tenantId, auth.session.user.id);
    const [serialized] = serializeTimeEntries([entry], canViewCosts(auth.session));
    return NextResponse.json({ data: serialized }, { status: 201 });
  } catch (err) {
    console.error("[api] POST time-entries:", err);
    const message = err instanceof RangeError ? err.message : "Failed to log time";
    return NextResponse.json({ error: message }, { status: err instanceof RangeError ? 422 : 500 });
  }
}
