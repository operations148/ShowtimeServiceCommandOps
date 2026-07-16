import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import { listPortalProperties } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

// GET /api/portal/properties — the customer's authorized properties (summary only).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  try {
    return NextResponse.json({ data: await listPortalProperties(context.tenantId, context.propertyIds) });
  } catch (err) {
    console.error("[api] GET /api/portal/properties:", err);
    return NextResponse.json({ error: "Failed to load properties" }, { status: 500 });
  }
}
