import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getJobCostSummary } from "@/lib/db/queries/costing";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]/costing
//
// The job-costing summary: labor/mileage/expense breakdown, contract value,
// and DERIVED margin. This is the money view — gated on canViewJobCosting, so
// technicians and office staff get 403 here by design (ADR-0016 §3). There is
// no redacted variant of this endpoint: a summary without cost is just noise.
// ---------------------------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requirePermission("canViewJobCosting");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await getJobCostSummary(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/costing:", err);
    return NextResponse.json({ error: "Failed to load job costing" }, { status: 500 });
  }
}
