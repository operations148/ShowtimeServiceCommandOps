import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess } from "@/lib/portal/auth";
import { getChangeOrderById, getChangeOrderLines } from "@/lib/db/queries/change-orders";
import { toPublicChangeOrder } from "@/lib/change-orders/public-serializer";
import { getChangeOrderPropertyId, getPortalBranding } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Change order not found";

// GET /api/portal/change-orders/[id] — full redacted change order, only if its
// work order's property is one the customer can access.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  try {
    const propertyId = await getChangeOrderPropertyId(id, context.tenantId);
    if (!assertPropertyAccess(context, propertyId)) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    const co = await getChangeOrderById(id, context.tenantId, { withLines: true });
    if (!co) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const lines = co.line_items ?? (await getChangeOrderLines(id, context.tenantId));
    const branding = await getPortalBranding(context.tenantId);
    return NextResponse.json({ data: toPublicChangeOrder(co, lines, branding), version: co.version });
  } catch (err) {
    console.error("[api] GET /api/portal/change-orders/[id]:", err);
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
}
