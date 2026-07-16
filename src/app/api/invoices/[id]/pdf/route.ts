import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getInvoiceById, getInvoiceLines } from "@/lib/db/queries/invoices";
import { listPaymentsForInvoice } from "@/lib/db/queries/payments";
import { getTenantById } from "@/lib/db/queries/tenants";
import { toPublicInvoice } from "@/lib/invoices/public-serializer";
import { buildInvoicePdf } from "@/lib/invoices/pdf";
import { canAcceptPayments } from "@/lib/stripe/connect";
import type { TenantBranding } from "@/lib/estimates/public-serializer";

// GET /api/invoices/[id]/pdf — customer-facing PDF from the redacted view.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const invoice = await getInvoiceById(id, tenantId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    const [lines, payments, tenant] = await Promise.all([
      getInvoiceLines(id, tenantId),
      listPaymentsForInvoice(id, tenantId),
      getTenantById(tenantId),
    ]);

    const branding: TenantBranding = {
      company_name: (tenant as { name?: string } | undefined)?.name ?? "ServiceOps",
      company_logo_url: (tenant as { logo_url?: string | null } | undefined)?.logo_url ?? null,
      company_phone: (tenant as { business_phone?: string | null } | undefined)?.business_phone ?? null,
      company_email: (tenant as { business_email?: string | null } | undefined)?.business_email ?? null,
    };
    const publicView = toPublicInvoice(invoice, lines, payments, branding, {
      canPayOnline: tenant ? canAcceptPayments(tenant) : false,
    });

    const pdf = await buildInvoicePdf(publicView);
    const filename = `ServiceOps-${invoice.invoice_number}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("[api] GET /api/invoices/[id]/pdf:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
