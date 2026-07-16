import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess } from "@/lib/portal/auth";
import { getEstimateById, getEstimateLines } from "@/lib/db/queries/estimates";
import { toPublicEstimate } from "@/lib/estimates/public-serializer";
import { getPortalBranding } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

const NOT_FOUND = "Estimate not found";

// GET /api/portal/estimates/[id] — full redacted estimate, only if it belongs
// to one of the customer's authorized properties.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  try {
    const estimate = await getEstimateById(id, context.tenantId, { withLines: true });
    // A miss OR a property the customer can't access → the SAME 404 (no oracle).
    if (!estimate || !assertPropertyAccess(context, estimate.property_id)) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    const lines = estimate.line_items ?? (await getEstimateLines(id, context.tenantId));
    const branding = await getPortalBranding(context.tenantId);
    return NextResponse.json({ data: toPublicEstimate(estimate, lines, branding), version: estimate.version });
  } catch (err) {
    console.error("[api] GET /api/portal/estimates/[id]:", err);
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
}
