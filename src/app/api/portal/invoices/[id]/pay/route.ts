import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess, recordPortalEvent } from "@/lib/portal/auth";
import { getInvoiceById, issueInvoiceToken } from "@/lib/db/queries/invoices";
import { getTenantById } from "@/lib/db/queries/tenants";
import { createInvoiceCheckoutSession } from "@/lib/stripe/checkout";
import { PortalPaySchema } from "@/lib/validation/portal";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Invoice not found";

// POST /api/portal/invoices/[id]/pay — property-gated. Creates a Stripe
// Checkout Session on the tenant's connected account. Amount/currency/tenant/
// invoice are ALL server-owned (never the body) — reuses the same
// createInvoiceCheckoutSession as the public pay route.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;
  const ip = getClientIp(request);

  const limit = await checkRateLimit(`${context.portalCustomerId}`, "portalAction");
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  let body: unknown = {};
  try { body = await request.json(); } catch { /* default balance */ }
  const parsed = PortalPaySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const invoice = await getInvoiceById(id, context.tenantId);
  if (!invoice || !assertPropertyAccess(context, invoice.property_id ?? null)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
  const tenant = await getTenantById(context.tenantId);
  if (!tenant) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  // Mint a fresh public token so Stripe's success/cancel redirect resolves.
  const issued = await issueInvoiceToken(id, context.tenantId, 30);
  if (!issued) return NextResponse.json({ error: "Could not prepare payment." }, { status: 500 });

  const result = await createInvoiceCheckoutSession(invoice, tenant, parsed.data.payment_type, issued.token);
  if (!result.ok) {
    if (result.reason === "payments_not_enabled") return NextResponse.json({ error: "Online payment isn't available for this invoice. Please contact us." }, { status: 409 });
    if (result.reason === "nothing_due") return NextResponse.json({ error: "This invoice has nothing due." }, { status: 409 });
    return NextResponse.json({ error: "Unable to start payment. Please try again." }, { status: 502 });
  }

  await recordPortalEvent({ tenantId: context.tenantId, portalCustomerId: context.portalCustomerId, eventType: "invoice_paid", ip, userAgent: request.headers.get("user-agent"), metadata: { invoice_id: id, payment_type: parsed.data.payment_type, initiated: true } });
  return NextResponse.json({ data: { checkoutUrl: result.checkoutUrl } });
}
