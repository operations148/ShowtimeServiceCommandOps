import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicInvoice } from "@/lib/invoices/public-resolve";
import { toPublicInvoice } from "@/lib/invoices/public-serializer";
import { getInvoiceLines, markInvoiceViewed } from "@/lib/db/queries/invoices";
import { listPaymentsForInvoice } from "@/lib/db/queries/payments";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This invoice link is no longer valid. Please contact the sender for a new one.";

// GET /api/public/invoices/[token] — UNAUTHENTICATED customer view.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(request);

  const limit = await checkRateLimit(`${ip}`, "publicEstimateView");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  try {
    const resolved = await resolvePublicInvoice(token, { withLines: true });
    if (!resolved.ok) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });

    const { invoice, branding, canPayOnline } = resolved;

    await markInvoiceViewed(invoice.id, invoice.tenant_id, {
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    const [lines, payments] = await Promise.all([
      invoice.line_items ? Promise.resolve(invoice.line_items) : getInvoiceLines(invoice.id, invoice.tenant_id),
      listPaymentsForInvoice(invoice.id, invoice.tenant_id),
    ]);
    const publicView = toPublicInvoice(invoice, lines, payments, branding, { canPayOnline });
    return NextResponse.json({ data: publicView, version: invoice.version });
  } catch (err) {
    console.error("[api] GET /api/public/invoices/[token]:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
  }
}
