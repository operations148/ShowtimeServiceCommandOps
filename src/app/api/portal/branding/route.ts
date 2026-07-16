import { type NextRequest, NextResponse } from "next/server";
import { resolvePortalSession } from "@/lib/portal/session";
import { cookies } from "next/headers";
import { PORTAL_COOKIE } from "@/lib/portal/session";
import { getPortalBranding } from "@/lib/db/queries/portal-data";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/portal/branding — tenant branding for the portal chrome. Available
// to a signed-in customer (from their session's tenant). The public login page
// has no tenant context, so it falls back to default branding.
export async function GET(_request: NextRequest) {
  const cookieStore = await cookies();
  const context = await resolvePortalSession(cookieStore.get(PORTAL_COOKIE)?.value);

  if (!context) {
    // Unauthenticated (login page): if there's exactly one tenant, brand with
    // it; otherwise default. Never leaks per-customer data either way.
    const { data: tenants } = await db.from("tenants").select("id").eq("is_active", true).limit(2);
    if ((tenants ?? []).length === 1) {
      const branding = await getPortalBranding((tenants as { id: string }[])[0].id);
      return NextResponse.json({ data: { ...branding, booking_url: null } });
    }
    return NextResponse.json({ data: { company_name: "Customer Portal", company_logo_url: null, company_phone: null, company_email: null, booking_url: null } });
  }

  const branding = await getPortalBranding(context.tenantId);
  return NextResponse.json({ data: branding });
}
