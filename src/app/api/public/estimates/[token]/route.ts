import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicEstimate } from "@/lib/estimates/public-resolve";
import { toPublicEstimate } from "@/lib/estimates/public-serializer";
import { markEstimateViewed, getEstimateLines } from "@/lib/db/queries/estimates";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This estimate link is no longer valid. Please contact the sender for a new one.";

// GET /api/public/estimates/[token] — UNAUTHENTICATED customer view.
// Rate limited by IP; marks the estimate viewed; returns only public fields.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(request);

  const limit = await checkRateLimit(`${ip}`, "publicEstimateView");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  try {
    const resolved = await resolvePublicEstimate(token, { withLines: true });
    if (!resolved.ok) {
      // Single generic error — no oracle for missing vs expired vs revoked.
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    }

    const { estimate, branding } = resolved;

    // Mark viewed on first open (best-effort, idempotent).
    await markEstimateViewed(estimate.id, estimate.tenant_id, {
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    const lines = estimate.line_items ?? (await getEstimateLines(estimate.id, estimate.tenant_id));
    const publicView = toPublicEstimate(estimate, lines, branding);
    // The current server-computed version is required by the accept/decline
    // submit; expose it separately from the redacted document body.
    return NextResponse.json({ data: publicView, version: estimate.version });
  } catch (err) {
    console.error("[api] GET /api/public/estimates/[token]:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
  }
}
