import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import { listPortalWorkOrders } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

// GET /api/portal/work-history — the customer's work orders (summary only).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  try {
    return NextResponse.json({ data: await listPortalWorkOrders(context.tenantId, context.propertyIds) });
  } catch (err) {
    console.error("[api] GET /api/portal/work-history:", err);
    return NextResponse.json({ error: "Failed to load work history" }, { status: 500 });
  }
}
