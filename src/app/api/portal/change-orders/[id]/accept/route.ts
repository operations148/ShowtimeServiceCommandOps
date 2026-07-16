import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess, recordPortalEvent } from "@/lib/portal/auth";
import { acceptChangeOrder } from "@/lib/change-orders/decisions";
import { getChangeOrderPropertyId } from "@/lib/db/queries/portal-data";
import { PortalDecisionSchema } from "@/lib/validation/portal";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Change order not found";

// POST /api/portal/change-orders/[id]/accept — property-gated, reuses the SAME
// acceptChangeOrder domain logic as the public token route (which atomically
// applies the contract-value bump to the parent work order — ADR-0011).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  const limit = await checkRateLimit(`${context.portalCustomerId}`, "portalAction");
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = PortalDecisionSchema.safeParse(body);
  if (!parsed.success || !parsed.data.accepted_by_name) {
    return NextResponse.json({ error: "Please type your name to approve.", fieldErrors: parsed.success ? undefined : parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const propertyId = await getChangeOrderPropertyId(id, context.tenantId);
  if (!assertPropertyAccess(context, propertyId)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

  const result = await acceptChangeOrder(id, context.tenantId, { version: parsed.data.version, acceptedByName: parsed.data.accepted_by_name }, { ip, userAgent });
  if (!result.ok) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: NOT_FOUND },
      expired: { status: 410, message: "This change order has expired." },
      stale_version: { status: 409, message: "This change order was updated. Reload before responding." },
      not_decidable: { status: 409, message: "This change order has already been responded to." },
    };
    const m = map[result.reason] ?? { status: 400, message: "Unable to accept this change order." };
    return NextResponse.json({ error: m.message }, { status: m.status });
  }

  if (!("alreadyDecided" in result) || !result.alreadyDecided) {
    await recordPortalEvent({ tenantId: context.tenantId, portalCustomerId: context.portalCustomerId, eventType: "change_order_accepted", ip, userAgent, metadata: { change_order_id: id } });
  }
  return NextResponse.json({ data: { ok: true } });
}
