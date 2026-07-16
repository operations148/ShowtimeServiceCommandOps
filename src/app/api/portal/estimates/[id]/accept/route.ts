import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, assertPropertyAccess, recordPortalEvent } from "@/lib/portal/auth";
import { getEstimateById } from "@/lib/db/queries/estimates";
import { acceptEstimate } from "@/lib/estimates/decisions";
import { PortalDecisionSchema } from "@/lib/validation/portal";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
const NOT_FOUND = "Estimate not found";

// POST /api/portal/estimates/[id]/accept — authenticated customer accepts.
// Property-access gated, then reuses the SAME acceptEstimate domain logic as
// the public token route (no duplicated business logic).
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
    return NextResponse.json({ error: "Please type your name to accept.", fieldErrors: parsed.success ? undefined : parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const estimate = await getEstimateById(id, context.tenantId, { withLines: true });
  if (!estimate || !assertPropertyAccess(context, estimate.property_id)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
  // Accept all standard + pre-selected lines (portal has no per-line option UI;
  // the customer accepts the estimate as presented).
  const selectedLineIds = (estimate.line_items ?? []).filter((l) => l.kind === "standard" || l.is_selected).map((l) => l.id);

  const result = await acceptEstimate(
    id, context.tenantId,
    { version: parsed.data.version, selectedLineIds, acceptedByName: parsed.data.accepted_by_name, termsAcknowledged: true },
    { ip, userAgent }
  );
  if (!result.ok) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: NOT_FOUND },
      expired: { status: 410, message: "This estimate has expired. Please contact us for an updated version." },
      stale_version: { status: 409, message: "This estimate was updated. Reload the page before responding." },
      not_decidable: { status: 409, message: "This estimate has already been responded to." },
      invalid_selection: { status: 422, message: "Invalid selection." },
    };
    const m = map[result.reason] ?? { status: 400, message: "Unable to accept this estimate." };
    return NextResponse.json({ error: m.message }, { status: m.status });
  }

  if (!("alreadyDecided" in result) || !result.alreadyDecided) {
    await recordPortalEvent({ tenantId: context.tenantId, portalCustomerId: context.portalCustomerId, eventType: "estimate_accepted", ip, userAgent, metadata: { estimate_id: id } });
  }
  return NextResponse.json({ data: { ok: true } });
}
