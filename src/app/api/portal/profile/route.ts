import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, recordPortalEvent } from "@/lib/portal/auth";
import { getPortalCustomerById, updatePortalCustomer } from "@/lib/db/queries/portal-customers";
import { UpdatePortalProfileSchema } from "@/lib/validation/portal";
import { getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/portal/profile — the customer's own basic profile.
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const customer = await getPortalCustomerById(context.portalCustomerId, context.tenantId);
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: { email: customer.email, name: customer.name, phone: customer.phone ?? null } });
}

// PATCH /api/portal/profile — update basic profile (name/phone only; email is
// the identity and is not self-editable).
export async function PATCH(request: NextRequest) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = UpdatePortalProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const result = await updatePortalCustomer(context.portalCustomerId, { name: parsed.data.name, phone: parsed.data.phone }, context.tenantId);
  if (!result.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordPortalEvent({
    tenantId: context.tenantId,
    portalCustomerId: context.portalCustomerId,
    eventType: "profile_updated",
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ data: { email: result.customer.email, name: result.customer.name, phone: result.customer.phone ?? null } });
}
