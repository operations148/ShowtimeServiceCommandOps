import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { startConnectOnboarding } from "@/lib/stripe/connect";
import { recordAuditEvent } from "@/lib/security/audit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://serviceops-ghl-workorders.vercel.app";

// POST /api/settings/stripe/onboard — start (or resume) Stripe Connect Express
// onboarding. Returns a fresh Account Link URL for the admin to complete.
export async function POST(_request: NextRequest) {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  try {
    const result = await startConnectOnboarding(tenantId, {
      returnUrl: `${APP_URL}/dashboard/settings?stripe=return`,
      refreshUrl: `${APP_URL}/dashboard/settings?stripe=refresh`,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Failed to start Stripe onboarding", detail: result.reason }, { status: 502 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "stripe.onboarding_started",
      description: `Started Stripe Connect onboarding (account ${result.accountId})`,
      entityType: "tenant",
      entityId: tenantId,
    });

    return NextResponse.json({ data: { url: result.url } });
  } catch (err) {
    console.error("[api] POST /api/settings/stripe/onboard:", err);
    return NextResponse.json({ error: "Failed to start Stripe onboarding" }, { status: 500 });
  }
}
