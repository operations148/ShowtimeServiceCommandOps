import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getChangeOrderVersions } from "@/lib/db/queries/change-orders";

// GET /api/change-orders/[id]/versions
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewChangeOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await getChangeOrderVersions(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/change-orders/[id]/versions:", err);
    return NextResponse.json({ error: "Failed to load version history" }, { status: 500 });
  }
}
