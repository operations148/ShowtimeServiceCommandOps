import { type NextRequest, NextResponse } from "next/server";
import { RequestLinkSchema } from "@/lib/validation/portal";
import { getActivePortalCustomersByEmail } from "@/lib/db/queries/portal-customers";
import { sendPortalMagicLink } from "@/lib/portal/send-magic-link";
import { recordPortalEvent } from "@/lib/portal/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/portal/request-link — UNAUTHENTICATED. Emails a magic sign-in link
// if an active portal account exists. Response is ALWAYS the same generic
// success regardless of whether the email matched — no enumeration oracle.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const limit = await checkRateLimit(`${ip}`, "portalLinkRequest");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = RequestLinkSchema.safeParse(body);
  // Even a malformed email gets the generic response (no oracle) — but a 422
  // on a clearly-invalid shape is fine since it's not account-existence info.
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 });
  }

  try {
    const customers = await getActivePortalCustomersByEmail(parsed.data.email);
    // Send one link per matching account (an email can be a portal user under
    // more than one tenant). Failures/absence never change the response.
    for (const customer of customers) {
      await sendPortalMagicLink(customer, "login", { ip });
      await recordPortalEvent({
        tenantId: customer.tenant_id,
        portalCustomerId: customer.id,
        eventType: "link_requested",
        ip,
        userAgent: request.headers.get("user-agent"),
      });
    }
  } catch (err) {
    // Log server-side; still return the generic success so a DB hiccup isn't
    // an existence oracle either.
    console.error("[api] POST /api/portal/request-link:", err);
  }

  return NextResponse.json({ data: { sent: true } });
}
