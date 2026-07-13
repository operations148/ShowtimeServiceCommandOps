import { type NextRequest, NextResponse } from "next/server";
import { resolvePublicChangeOrder } from "@/lib/change-orders/public-resolve";
import { acceptChangeOrder } from "@/lib/change-orders/decisions";
import { toPublicChangeOrder } from "@/lib/change-orders/public-serializer";
import { getChangeOrderLines } from "@/lib/db/queries/change-orders";
import { PublicAcceptChangeOrderSchema } from "@/lib/validation/change-order";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "This change order link is no longer valid. Please contact the sender for a new one.";

// POST /api/public/change-orders/[token]/accept — UNAUTHENTICATED, idempotent.
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

  const parsed = PublicAcceptChangeOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please complete all required fields", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const resolved = await resolvePublicChangeOrder(token);
    if (!resolved.ok) return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    const { changeOrder, branding } = resolved;

    const result = await acceptChangeOrder(
      changeOrder.id,
      changeOrder.tenant_id,
      { version: parsed.data.version, acceptedByName: parsed.data.accepted_by_name, signature: parsed.data.signature },
      { ip, userAgent }
    );

    if (!result.ok) {
      const map: Record<string, { status: number; message: string }> = {
        not_found: { status: 404, message: GENERIC_ERROR },
        expired: { status: 410, message: "This change order has expired. Please contact the sender for an updated version." },
        stale_version: { status: 409, message: "This change order was updated. Please reload the page to see the latest version before responding." },
        not_decidable: { status: 409, message: "This change order has already been responded to." },
      };
      const m = map[result.reason] ?? { status: 400, message: "Unable to accept this change order." };
      return NextResponse.json({ error: m.message }, { status: m.status });
    }

    if (result.alreadyDecided) {
      return NextResponse.json({ data: { status: result.status, alreadyDecided: true } });
    }

    await recordAuditEvent({
      tenantId: changeOrder.tenant_id,
      userId: null,
      actionType: "change_order.accepted",
      description: `Customer accepted change order ${changeOrder.change_order_number}`,
      entityType: "change_order",
      entityId: changeOrder.id,
      source: "public",
      metadata: { by: parsed.data.accepted_by_name },
    });

    const lines = await getChangeOrderLines(changeOrder.id, changeOrder.tenant_id);
    const publicView = toPublicChangeOrder(result.changeOrder, lines, branding);
    return NextResponse.json({ data: { status: result.changeOrder.status, alreadyDecided: false, changeOrder: publicView } });
  } catch (err) {
    console.error("[api] POST /api/public/change-orders/[token]/accept:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
