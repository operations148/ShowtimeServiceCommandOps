import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicChangeOrder } from "@/lib/change-orders/public-resolve";
import { toPublicChangeOrder } from "@/lib/change-orders/public-serializer";
import { markChangeOrderViewed, getChangeOrderLines } from "@/lib/db/queries/change-orders";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This change order link is no longer valid. Please contact the sender for a new one.";

// GET /api/public/change-orders/[token] — UNAUTHENTICATED customer view.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(request);

  const limit = await checkRateLimit(`${ip}`, "publicEstimateView");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  try {
    const resolved = await resolvePublicChangeOrder(token, { withLines: true });
    if (!resolved.ok) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });

    const { changeOrder, branding } = resolved;

    await markChangeOrderViewed(changeOrder.id, changeOrder.tenant_id, {
      ip,
      userAgent: request.headers.get("user-agent"),
    });

    const lines = changeOrder.line_items ?? (await getChangeOrderLines(changeOrder.id, changeOrder.tenant_id));
    const publicView = toPublicChangeOrder(changeOrder, lines, branding);
    return NextResponse.json({ data: publicView, version: changeOrder.version });
  } catch (err) {
    console.error("[api] GET /api/public/change-orders/[token]:", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
  }
}
