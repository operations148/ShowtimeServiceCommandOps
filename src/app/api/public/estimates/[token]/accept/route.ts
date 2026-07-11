import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicEstimate } from "@/lib/estimates/public-resolve";
import { acceptEstimate } from "@/lib/estimates/decisions";
import { toPublicEstimate } from "@/lib/estimates/public-serializer";
import { getEstimateLines, recordEstimateEvent } from "@/lib/db/queries/estimates";
import { PublicAcceptSchema } from "@/lib/validation/estimate";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This estimate link is no longer valid. Please contact the sender for a new one.";

// POST /api/public/estimates/[token]/accept — UNAUTHENTICATED, idempotent.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  const limit = await checkRateLimit(`${ip}`, "publicEstimateDecision");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = PublicAcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please complete all required fields", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const resolved = await resolvePublicEstimate(token);
    if (!resolved.ok) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    const { estimate, branding } = resolved;

    const result = await acceptEstimate(
      estimate.id,
      estimate.tenant_id,
      {
        version: parsed.data.version,
        selectedLineIds: parsed.data.selected_line_ids,
        acceptedByName: parsed.data.accepted_by_name,
        signature: parsed.data.signature,
        termsAcknowledged: true,
      },
      { ip, userAgent }
    );

    if (!result.ok) {
      // Map internal reasons to safe, customer-appropriate messages.
      const map: Record<string, { status: number; message: string }> = {
        not_found: { status: 404, message: GENERIC_ERROR },
        expired: { status: 410, message: "This estimate has expired. Please contact the sender for an updated quote." },
        stale_version: { status: 409, message: "This estimate was updated. Please reload the page to see the latest version before responding." },
        not_decidable: { status: 409, message: "This estimate has already been responded to." },
        invalid_selection: { status: 422, message: "Your selections are invalid. Please review your choices and try again." },
      };
      const m = map[result.reason] ?? { status: 400, message: "Unable to accept this estimate." };
      return NextResponse.json({ error: m.message }, { status: m.status });
    }

    if (result.alreadyDecided) {
      // Idempotent replay — return the current decided state, not an error.
      return NextResponse.json({ data: { status: result.status, alreadyDecided: true } });
    }

    await recordAuditEvent({
      tenantId: estimate.tenant_id,
      userId: null,
      actionType: "estimate.accepted",
      description: `Customer accepted estimate ${estimate.estimate_number}`,
      entityType: "estimate",
      entityId: estimate.id,
      source: "public",
      metadata: { by: parsed.data.accepted_by_name },
    });
    void recordEstimateEvent; // (already recorded inside acceptEstimate)

    const lines = await getEstimateLines(estimate.id, estimate.tenant_id);
    const publicView = toPublicEstimate(result.estimate, lines, branding);
    return NextResponse.json({ data: { status: result.estimate.status, alreadyDecided: false, estimate: publicView } });
  } catch (err) {
    console.error("[api] POST /api/public/estimates/[token]/accept:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
