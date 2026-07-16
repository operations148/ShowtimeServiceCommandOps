import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumeMagicLink } from "@/lib/portal/magic-link";
import { issuePortalSession, PORTAL_COOKIE } from "@/lib/portal/session";
import { getPortalCustomerById, touchPortalCustomerLogin } from "@/lib/db/queries/portal-customers";
import { recordPortalEvent } from "@/lib/portal/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const ConsumeSchema = z.object({ token: z.string().min(20).max(200) });

// POST /api/portal/auth/consume — UNAUTHENTICATED. Consumes a one-time magic
// link (atomic claim; a replay fails), issues a revocable session, and sets
// the HttpOnly portal cookie. Invoked by the /portal/auth/[token] client page
// so email-client prefetch (which doesn't run JS) can't burn the token.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  const limit = await checkRateLimit(`${ip}`, "portalAuth");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please request a new link." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = ConsumeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "This sign-in link is invalid or has expired." }, { status: 400 });
  }

  const result = await consumeMagicLink(parsed.data.token);
  if (!result.ok) {
    return NextResponse.json({ error: "This sign-in link is invalid or has expired." }, { status: 401 });
  }

  const customer = await getPortalCustomerById(result.portalCustomerId, result.tenantId);
  if (!customer || !customer.is_active) {
    return NextResponse.json({ error: "This sign-in link is invalid or has expired." }, { status: 401 });
  }

  try {
    const session = await issuePortalSession(customer.id, customer.tenant_id, customer.session_version, { ip, userAgent });
    await touchPortalCustomerLogin(customer.id, customer.tenant_id);
    await recordPortalEvent({ tenantId: customer.tenant_id, portalCustomerId: customer.id, eventType: "logged_in", ip, userAgent });

    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.set(PORTAL_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(session.expiresAt),
    });
    return res;
  } catch (err) {
    console.error("[api] POST /api/portal/auth/consume:", err);
    return NextResponse.json({ error: "Could not sign you in. Please try again." }, { status: 500 });
  }
}
