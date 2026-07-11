import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicEstimate } from "@/lib/estimates/public-resolve";
import { declineEstimate } from "@/lib/estimates/decisions";
import { PublicDeclineSchema } from "@/lib/validation/estimate";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This estimate link is no longer valid. Please contact the sender for a new one.";

// POST /api/public/estimates/[token]/decline — UNAUTHENTICATED, idempotent.
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

  const parsed = PublicDeclineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const resolved = await resolvePublicEstimate(token);
    if (!resolved.ok) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    const { estimate } = resolved;

    const result = await declineEstimate(
      estimate.id,
      estimate.tenant_id,
      { version: parsed.data.version, reason: parsed.data.reason },
      { ip, userAgent }
    );

    if (!result.ok) {
      const map: Record<string, { status: number; message: string }> = {
        not_found: { status: 404, message: GENERIC_ERROR },
        expired: { status: 410, message: "This estimate has expired." },
        stale_version: { status: 409, message: "This estimate was updated. Please reload the page before responding." },
        not_decidable: { status: 409, message: "This estimate has already been responded to." },
      };
      const m = map[result.reason] ?? { status: 400, message: "Unable to decline this estimate." };
      return NextResponse.json({ error: m.message }, { status: m.status });
    }

    if (result.alreadyDecided) {
      return NextResponse.json({ data: { status: result.status, alreadyDecided: true } });
    }

    await recordAuditEvent({
      tenantId: estimate.tenant_id,
      userId: null,
      actionType: "estimate.declined",
      description: `Customer declined estimate ${estimate.estimate_number}`,
      entityType: "estimate",
      entityId: estimate.id,
      source: "public",
    });

    return NextResponse.json({ data: { status: result.estimate.status, alreadyDecided: false } });
  } catch (err) {
    console.error("[api] POST /api/public/estimates/[token]/decline:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
