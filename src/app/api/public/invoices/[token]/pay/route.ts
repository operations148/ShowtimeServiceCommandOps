import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicInvoice } from "@/lib/invoices/public-resolve";
import { getTenantById } from "@/lib/db/queries/tenants";
import { createInvoiceCheckoutSession } from "@/lib/stripe/checkout";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This invoice link is no longer valid. Please contact the sender for a new one.";

const PaySchema = z.object({
  payment_type: z.enum(["deposit", "balance"]).default("balance"),
});

// POST /api/public/invoices/[token]/pay — UNAUTHENTICATED. Creates a Stripe
// Checkout Session on the tenant's connected account. Amount/currency/tenant/
// invoice are ALL server-owned (resolved from the token, never the body).
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(request);

  const limit = await checkRateLimit(`${ip}`, "publicEstimateDecision");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // default to balance
  }
  const parsed = PaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }

  try {
    const resolved = await resolvePublicInvoice(token);
    if (!resolved.ok) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    const { invoice } = resolved;

    const tenant = await getTenantById(invoice.tenant_id);
    if (!tenant) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });

    const result = await createInvoiceCheckoutSession(invoice, tenant, parsed.data.payment_type, token);
    if (!result.ok) {
      if (result.reason === "payments_not_enabled") {
        return NextResponse.json({ error: "Online payment is not available for this invoice. Please contact the sender." }, { status: 409 });
      }
      if (result.reason === "nothing_due") {
        return NextResponse.json({ error: "This invoice has nothing due." }, { status: 409 });
      }
      return NextResponse.json({ error: "Unable to start payment. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ data: { checkoutUrl: result.checkoutUrl } });
  } catch (err) {
    console.error("[api] POST /api/public/invoices/[token]/pay:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
