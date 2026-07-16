import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import { listPortalInvoices } from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

// GET /api/portal/invoices — the customer's invoices (property-scoped summaries).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  try {
    return NextResponse.json({ data: await listPortalInvoices(context.tenantId, context.propertyIds) });
  } catch (err) {
    console.error("[api] GET /api/portal/invoices:", err);
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}
