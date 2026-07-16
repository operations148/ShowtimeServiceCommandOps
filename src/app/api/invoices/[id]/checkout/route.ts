import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getInvoiceById, issueInvoiceToken } from "@/lib/db/queries/invoices";
import { getTenantById } from "@/lib/db/queries/tenants";
import { createInvoiceCheckoutSession } from "@/lib/stripe/checkout";
import { z } from "zod";

const AdminCheckoutSchema = z.object({
  payment_type: z.enum(["deposit", "balance"]).default("balance"),
});

// POST /api/invoices/[id]/checkout — admin generates a Stripe Checkout link for
// a customer (e.g. to text/read it out). The public pay route is the customer's
// own path; this is the staff-initiated equivalent. Amount/currency are all
// server-owned from the invoice.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults to balance
  }
  const parsed = AdminCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const invoice = await getInvoiceById(id, tenantId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const tenant = await getTenantById(tenantId);
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    // Mint a fresh public token so the Stripe success/cancel redirect resolves
    // to a valid /invoice/<token> page (hashed at rest; the plaintext is only
    // used for this redirect + returned to the admin).
    const issued = await issueInvoiceToken(id, tenantId, 60);
    if (!issued) return NextResponse.json({ error: "Could not prepare a payment link" }, { status: 500 });

    const result = await createInvoiceCheckoutSession(invoice, tenant, parsed.data.payment_type, issued.token);
    if (!result.ok) {
      const statusMap: Record<string, number> = { payments_not_enabled: 409, nothing_due: 409, stripe_error: 502 };
      return NextResponse.json({ error: checkoutErrorMessage(result.reason), detail: result.detail }, { status: statusMap[result.reason] ?? 500 });
    }
    return NextResponse.json({ data: { checkoutUrl: result.checkoutUrl, amount: result.amount } });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/checkout:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}

function checkoutErrorMessage(reason: string): string {
  switch (reason) {
    case "payments_not_enabled": return "Online payments are not enabled — complete Stripe onboarding first";
    case "nothing_due": return "This invoice has nothing due";
    default: return "Failed to create checkout session";
  }
}
