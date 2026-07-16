import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import { listPortalChangeOrders } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

// GET /api/portal/change-orders — the customer's change orders (via their work orders).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  try {
    return NextResponse.json({ data: await listPortalChangeOrders(context.tenantId, context.propertyIds) });
  } catch (err) {
    console.error("[api] GET /api/portal/change-orders:", err);
    return NextResponse.json({ error: "Failed to load change orders" }, { status: 500 });
  }
}
