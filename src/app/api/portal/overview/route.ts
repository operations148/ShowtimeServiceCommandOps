import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import {
  listPortalProperties,
  listPortalEstimates,
  listPortalInvoices,
  listPortalWorkOrders,
} from "@/lib/db/queries/portal-data";

export const dynamic = "force-dynamic";

// GET /api/portal/overview — a scoped dashboard summary for the customer.
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  try {
    const [properties, estimates, invoices, workOrders] = await Promise.all([
      listPortalProperties(context.tenantId, context.propertyIds),
      listPortalEstimates(context.tenantId, context.propertyIds),
      listPortalInvoices(context.tenantId, context.propertyIds),
      listPortalWorkOrders(context.tenantId, context.propertyIds),
    ]);

    const outstanding = invoices.reduce((sum, i) => sum + i.amount_due, 0);
    const openEstimates = estimates.filter((e) => e.status === "sent" || e.status === "viewed").length;
    const upcoming = workOrders.filter((w) => w.completed_at == null && (w.status !== "cancelled")).length;

    return NextResponse.json({
      data: {
        name: context.name,
        property_count: properties.length,
        outstanding_balance_cents: outstanding,
        open_estimates: openEstimates,
        upcoming_visits: upcoming,
        recent_work: workOrders.slice(0, 5),
        recent_invoices: invoices.slice(0, 5),
      },
    });
  } catch (err) {
    console.error("[api] GET /api/portal/overview:", err);
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}
