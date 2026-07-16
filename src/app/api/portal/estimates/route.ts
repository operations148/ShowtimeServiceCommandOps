import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import { listPortalEstimates } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

// GET /api/portal/estimates — the customer's estimates (property-scoped summaries).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  try {
    return NextResponse.json({ data: await listPortalEstimates(context.tenantId, context.propertyIds) });
  } catch (err) {
    console.error("[api] GET /api/portal/estimates:", err);
    return NextResponse.json({ error: "Failed to load estimates" }, { status: 500 });
  }
}
