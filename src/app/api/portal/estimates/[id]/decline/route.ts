import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess, recordPortalEvent } from "@/lib/portal/auth";
import { getEstimateById } from "@/lib/db/queries/estimates";
import { declineEstimate } from "@/lib/estimates/decisions";
import { PortalDecisionSchema } from "@/lib/validation/portal";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Estimate not found";

// POST /api/portal/estimates/[id]/decline
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });

  const estimate = await getEstimateById(id, context.tenantId);
  if (!estimate || !assertPropertyAccess(context, estimate.property_id)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  const result = await declineEstimate(id, context.tenantId, { version: parsed.data.version, reason: parsed.data.reason }, { ip, userAgent });
  if (!result.ok) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: NOT_FOUND },
      expired: { status: 410, message: "This estimate has expired." },
      stale_version: { status: 409, message: "This estimate was updated. Reload the page before responding." },
      not_decidable: { status: 409, message: "This estimate has already been responded to." },
      invalid_selection: { status: 422, message: "Invalid request." },
    };
    const m = map[result.reason] ?? { status: 400, message: "Unable to decline this estimate." };
    return NextResponse.json({ error: m.message }, { status: m.status });
  }

  if (!("alreadyDecided" in result) || !result.alreadyDecided) {
    await recordPortalEvent({ tenantId: context.tenantId, portalCustomerId: context.portalCustomerId, eventType: "estimate_declined", ip, userAgent, metadata: { estimate_id: id } });
  }
  return NextResponse.json({ data: { ok: true } });
}
