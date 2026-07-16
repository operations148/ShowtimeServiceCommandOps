import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { refreshConnectStatus } from "@/lib/stripe/connect";

// GET /api/settings/stripe/status — live Connect account status for the admin
// settings panel (also syncs charges_enabled onto the tenant row).
export async function GET(_request: NextRequest) {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  try {
    const status = await refreshConnectStatus(tenantId);
    return NextResponse.json({ data: status });
  } catch (err) {
    console.error("[api] GET /api/settings/stripe/status:", err);
    // Stripe not configured / network error — report a safe disconnected state
    // rather than a 500 so the settings page still renders.
    return NextResponse.json({
      data: { connected: false, accountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] },
      warning: "Could not reach Stripe",
    });
  }
}
