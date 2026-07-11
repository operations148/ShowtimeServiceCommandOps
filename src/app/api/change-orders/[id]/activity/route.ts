import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getChangeOrderEvents } from "@/lib/db/queries/change-orders";

// GET /api/change-orders/[id]/activity
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewChangeOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await getChangeOrderEvents(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/change-orders/[id]/activity:", err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
