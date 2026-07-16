import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess, recordPortalEvent } from "@/lib/portal/auth";
import { getInvoiceById, getInvoiceLines } from "@/lib/db/queries/invoices";
import { listPaymentsForInvoice } from "@/lib/db/queries/payments";
import { getTenantById } from "@/lib/db/queries/tenants";
import { getPortalBranding } from "@/lib/db/queries/portal-data";
import { toPublicInvoice } from "@/lib/invoices/public-serializer";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { canAcceptPayments } from "@/lib/stripe/connect";
import { getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Invoice not found";

// GET /api/portal/invoices/[id]/pdf — receipt/invoice PDF, property-gated.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  try {
    const invoice = await getInvoiceById(id, context.tenantId);
    if (!invoice || !assertPropertyAccess(context, invoice.property_id ?? null)) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    const [lines, payments, branding, tenant] = await Promise.all([
      getInvoiceLines(id, context.tenantId),
      listPaymentsForInvoice(id, context.tenantId),
      getPortalBranding(context.tenantId),
      getTenantById(context.tenantId),
    ]);
    const view = toPublicInvoice(invoice, lines, payments, branding, { canPayOnline: tenant ? canAcceptPayments(tenant) : false });
    const pdf = await buildInvoicePdf(view);

    await recordPortalEvent({ tenantId: context.tenantId, portalCustomerId: context.portalCustomerId, eventType: "document_downloaded", ip: getClientIp(request), userAgent: request.headers.get("user-agent"), metadata: { invoice_id: id } });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
        "Content-Length": String(pdf.length),
        // Do not cache sensitive documents.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[api] GET /api/portal/invoices/[id]/pdf:", err);
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
}
