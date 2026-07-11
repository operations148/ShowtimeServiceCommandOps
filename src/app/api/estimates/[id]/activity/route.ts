import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getEstimateEvents } from "@/lib/db/queries/estimates";

// GET /api/estimates/[id]/activity — the estimate's event/send/approval log.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const events = await getEstimateEvents(id, tenantId);
    return NextResponse.json({ data: events });
  } catch (err) {
    console.error("[api] GET /api/estimates/[id]/activity:", err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
