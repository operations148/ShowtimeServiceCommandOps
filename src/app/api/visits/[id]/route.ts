import { type NextRequest, NextResponse } from "next/server";
import { PatchVisitSchema } from "@/lib/validation/visit";
import { getVisitById, updateVisit } from "@/lib/mock-data/visit-store";
import { WorkOrderStatus, EstimateHandoffStatus } from "@/types/work-order";
import { updateWorkOrder } from "@/lib/mock-data/store";
import { syncEstimateToGhl } from "@/lib/ghl/sync-estimate";

type RouteContext = { params: Promise<{ id: string }> };

// tenant_id is derived from session in production.
// For mock phase, read from query param with fallback to placeholder.
function resolveTenantId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("tenant_id") ?? "tenant-showtime";
}

// ---------------------------------------------------------------------------
// GET /api/visits/[id]
// Query params:
//   tenant_id — string (defaults to "tenant-showtime")
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const tenantId = resolveTenantId(request);

  const visit = getVisitById(id, tenantId);
  if (!visit) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  return NextResponse.json({ data: visit });
}

// ---------------------------------------------------------------------------
// PATCH /api/visits/[id]
// Supports partial updates: status, checklist, technician_notes,
// estimate_flagged, completed_at.
// Immutable fields (id, tenant_id, work_order_id, property_id, created_at)
// are never overwritten even if included in the body.
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const tenantId = resolveTenantId(request);

  const existingVisit = getVisitById(id, tenantId);
  if (!existingVisit) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = PatchVisitSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const updateResult = updateVisit(id, result.data, tenantId);
  if (!updateResult.ok) {
    return NextResponse.json({ error: `Visit "${id}" not found` }, { status: 404 });
  }

  const updatedVisit = updateResult.data;

  // Detect estimate_flagged transition: false → true.
  // Update work order status and fire-and-forget GHL task creation.
  const estimateFlaggedNow =
    !existingVisit.estimate_flagged && updatedVisit.estimate_flagged;

  if (estimateFlaggedNow) {
    updateWorkOrder(updatedVisit.work_order_id, {
      status: WorkOrderStatus.ESTIMATE_NEEDED,
      estimate_handoff_status: EstimateHandoffStatus.FLAGGED,
    });
    void syncEstimateToGhl(updatedVisit);
  }

  return NextResponse.json({ data: updatedVisit });
}
