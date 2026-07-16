import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, recordPortalEvent } from "@/lib/portal/auth";
import { revokePortalSession, PORTAL_COOKIE } from "@/lib/portal/session";
import { getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/portal/session — the current signed-in customer (for the layout).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  return NextResponse.json({ data: { email: context.email, name: context.name } });
}

// DELETE /api/portal/session — sign out (revoke THIS session + clear cookie).
export async function DELETE(request: NextRequest) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  await revokePortalSession(context.sessionId, context.tenantId);
  await recordPortalEvent({
    tenantId: context.tenantId,
    portalCustomerId: context.portalCustomerId,
    eventType: "signed_out",
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(PORTAL_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0) });
  return res;
}
