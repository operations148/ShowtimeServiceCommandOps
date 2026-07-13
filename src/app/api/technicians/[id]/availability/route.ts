import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, requireApiAuth, getTenantId, isTechnicianScoped } from "@/lib/auth/api-auth";
import { getAvailability, setAvailability } from "@/lib/db/queries/blocked-time";
import { SetAvailabilitySchema } from "@/lib/validation/scheduling";

// GET /api/technicians/[id]/availability — a technician may read their own;
// schedule managers may read anyone's.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const scoped = isTechnicianScoped(auth.session);
  if (scoped && auth.session.user.id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await getAvailability(tenantId, id);
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[api] GET /api/technicians/[id]/availability:", err);
    return NextResponse.json({ error: "Failed to load availability" }, { status: 500 });
  }
}

// PUT /api/technicians/[id]/availability — replace the weekly template.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The [id] in the path is authoritative for the technician.
  const parsed = SetAvailabilitySchema.safeParse({ ...(body as object), technician_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await setAvailability(parsed.data, tenantId);
    if (!result.ok) {
      return NextResponse.json({ error: "technician_id not found for this tenant" }, { status: 422 });
    }
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PUT /api/technicians/[id]/availability:", err);
    return NextResponse.json({ error: "Failed to set availability" }, { status: 500 });
  }
}
