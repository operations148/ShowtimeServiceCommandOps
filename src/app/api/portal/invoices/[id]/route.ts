import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess } from "@/lib/portal/auth";
import { getInvoiceById, getInvoiceLines } from "@/lib/db/queries/invoices";
import { listPaymentsForInvoice } from "@/lib/db/queries/payments";
import { toPublicInvoice } from "@/lib/invoices/public-serializer";
import { getPortalBranding } from "@/lib/db/queries/portal-data";
import { getTenantById } from "@/lib/db/queries/tenants";
import { canAcceptPayments } from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Invoice not found";

// GET /api/portal/invoices/[id] — full redacted invoice, only if its property
// is one the customer can access.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  try {
    const invoice = await getInvoiceById(id, context.tenantId, { withLines: true });
    if (!invoice || !assertPropertyAccess(context, invoice.property_id ?? null)) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    const [lines, payments, branding, tenant] = await Promise.all([
      invoice.line_items ? Promise.resolve(invoice.line_items) : getInvoiceLines(id, context.tenantId),
      listPaymentsForInvoice(id, context.tenantId),
      getPortalBranding(context.tenantId),
      getTenantById(context.tenantId),
    ]);
    const canPayOnline = tenant ? canAcceptPayments(tenant) : false;
    return NextResponse.json({ data: toPublicInvoice(invoice, lines, payments, branding, { canPayOnline }), version: invoice.version });
  } catch (err) {
    console.error("[api] GET /api/portal/invoices/[id]:", err);
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
}
