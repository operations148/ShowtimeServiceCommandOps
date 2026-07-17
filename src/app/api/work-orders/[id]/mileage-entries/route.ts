import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listMileageEntries, createMileageEntry } from "@/lib/db/queries/costing";
import { serializeMileageEntries } from "@/lib/costing/serialize";
import { canViewCosts, canLogAgainstWorkOrder, resolveEntryTechnicianId } from "@/lib/costing/authorize";
import { CreateMileageEntrySchema } from "@/lib/validation/costing";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/work-orders/[id]/mileage-entries — redacted unless canViewJobCosting.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  if (!(await canLogAgainstWorkOrder(auth.session, id, tenantId))) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  try {
    const entries = await listMileageEntries(id, tenantId);
    return NextResponse.json({ data: serializeMileageEntries(entries, canViewCosts(auth.session)) });
  } catch (err) {
    console.error("[api] GET mileage-entries:", err);
    return NextResponse.json({ error: "Failed to load mileage" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/mileage-entries — body carries miles only; the
// server prices it from the tenant's server-held mileage rate.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canLogJobCosts");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = CreateMileageEntrySchema.safeParse({ ...(body as object), work_order_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  if (!(await canLogAgainstWorkOrder(auth.session, id, tenantId))) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const technicianId = resolveEntryTechnicianId(auth.session, parsed.data.technician_id);
  if (!technicianId) {
    return NextResponse.json({ error: "No technician to attribute this mileage to" }, { status: 422 });
  }

  try {
    const entry = await createMileageEntry(parsed.data, technicianId, tenantId, auth.session.user.id);
    const [serialized] = serializeMileageEntries([entry], canViewCosts(auth.session));
    return NextResponse.json({ data: serialized }, { status: 201 });
  } catch (err) {
    console.error("[api] POST mileage-entries:", err);
    const message = err instanceof RangeError ? err.message : "Failed to log mileage";
    return NextResponse.json({ error: message }, { status: err instanceof RangeError ? 422 : 500 });
  }
}
