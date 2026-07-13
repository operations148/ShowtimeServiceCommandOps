import { type NextRequest, NextResponse } from "next/server";
import { CreateVisitSchema } from "@/lib/validation/visit";
import { listVisits, createVisit } from "@/lib/db/queries/visits";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { getPropertyById } from "@/lib/db/queries/properties";
import { db } from "@/lib/db/client";
import { VisitStatus } from "@/types/visit";
import { UserRole } from "@/types/technician";
import { requireApiAuth, isTechnicianScoped, getTenantId } from "@/lib/auth/api-auth";

// ---------------------------------------------------------------------------
// GET /api/visits
//
// TENANT_ADMIN / OFFICE_STAFF: full list, all filters available.
// TECHNICIAN: automatically scoped to their technician_id.
//
// Query params:
//   work_order_id    — filter by work order
//   property_id      — filter by property
//   technician_id    — filter by assigned tech (ignored/overridden for TECHNICIAN role)
//   status           — VisitStatus enum value
//   estimate_flagged — "true" | "false"
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = request.nextUrl;

  const workOrderId = searchParams.get("work_order_id") ?? undefined;
  const propertyId  = searchParams.get("property_id")   ?? undefined;
  const rawStatus   = searchParams.get("status")        ?? undefined;
  const rawEstimate = searchParams.get("estimate_flagged") ?? undefined;

  if (rawStatus !== undefined) {
    if (!Object.values(VisitStatus).includes(rawStatus as VisitStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status value: "${rawStatus}" — must be one of: ${Object.values(VisitStatus).join(", ")}`,
        },
        { status: 400 }
      );
    }
  }

  let estimateFlaggedFilter: boolean | undefined;
  if (rawEstimate !== undefined) {
    if (rawEstimate === "true") {
      estimateFlaggedFilter = true;
    } else if (rawEstimate === "false") {
      estimateFlaggedFilter = false;
    } else {
      return NextResponse.json(
        { error: `Invalid estimate_flagged value: "${rawEstimate}" — must be "true" or "false"` },
        { status: 400 }
      );
    }
  }

  // Technicians can only list their own visits.
  const technicianIdFilter = isTechnicianScoped(auth.session)
    ? auth.session.user.technician_id
    : (searchParams.get("technician_id") ?? undefined);

  try {
    const visits = await listVisits({
      tenant_id:        tenantId,
      work_order_id:    workOrderId,
      property_id:      propertyId,
      technician_id:    technicianIdFilter,
      status:           rawStatus as VisitStatus | undefined,
      estimate_flagged: estimateFlaggedFilter,
    });
    return NextResponse.json({ data: visits, total: visits.length });
  } catch (err) {
    console.error("[api] GET /api/visits failed:", err);
    return NextResponse.json({ error: "Failed to load visits" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/visits
//
// All authenticated roles allowed — technicians create visits via mobile flow.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = CreateVisitSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const input = result.data;

  // security-audit M8: previously no verification that work_order_id/
  // property_id belonged to the caller's tenant, and technician_id was
  // caller-suppliable with no scoping — a technician could create a visit
  // against another tenant's work order or attribute it to a different
  // technician.
  const [workOrder, property] = await Promise.all([
    getWorkOrderById(input.work_order_id, tenantId),
    getPropertyById(input.property_id, tenantId),
  ]);

  if (!workOrder) {
    return NextResponse.json({ error: "work_order_id not found for this tenant" }, { status: 422 });
  }
  if (!property) {
    return NextResponse.json({ error: "property_id not found for this tenant" }, { status: 422 });
  }

  if (isTechnicianScoped(auth.session)) {
    // Technicians can only create visits attributed to themselves, regardless
    // of what technician_id the request body supplied.
    input.technician_id = auth.session.user.technician_id;
  } else if (input.technician_id) {
    const { data: technician } = await db
      .from("users")
      .select("id")
      .eq("id", input.technician_id)
      .eq("tenant_id", tenantId)
      .eq("role", UserRole.TECHNICIAN)
      .maybeSingle();
    if (!technician) {
      return NextResponse.json({ error: "technician_id not found for this tenant" }, { status: 422 });
    }
  }

  try {
    const created = await createVisit(input, tenantId);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/visits failed:", err);
    return NextResponse.json({ error: "Failed to create visit" }, { status: 500 });
  }
}
