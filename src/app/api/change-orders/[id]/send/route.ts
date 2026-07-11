import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { sendChangeOrder } from "@/lib/change-orders/send";
import { ChangeOrderSendSchema } from "@/lib/validation/change-order";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/change-orders/[id]/send — manual send (preview by default).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canSendEstimateEmail");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  const limit = await checkRateLimit(`${tenantId}:${userId}`, "adminAction");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ChangeOrderSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await sendChangeOrder(
      id,
      tenantId,
      { version: parsed.data.version, recipientEmail: parsed.data.recipient_email, expiresInDays: parsed.data.expires_in_days },
      { userId, name: (auth.session.user as { name?: string }).name }
    );
    if (!result.ok) {
      const statusMap: Record<string, number> = { not_found: 404, stale_version: 409, invalid_state: 409, no_recipient: 422, send_failed: 502 };
      return NextResponse.json({ error: sendErrorMessage(result.reason), detail: result.detail }, { status: statusMap[result.reason] ?? 500 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "change_order.sent",
      description: `Sent change order ${id} (${result.previewMode ? "preview" : result.delivered ? "delivered" : "queued"})`,
      entityType: "change_order",
      entityId: id,
      metadata: { previewMode: result.previewMode, testOverride: result.testOverride, delivered: result.delivered },
    });

    return NextResponse.json({
      data: { delivered: result.delivered, previewMode: result.previewMode, testOverride: result.testOverride, publicUrl: result.publicUrl },
    });
  } catch (err) {
    console.error("[api] POST /api/change-orders/[id]/send:", err);
    return NextResponse.json({ error: "Failed to send change order" }, { status: 500 });
  }
}

function sendErrorMessage(reason: string): string {
  switch (reason) {
    case "not_found": return "Change order not found";
    case "stale_version": return "This change order changed since you loaded it. Reload and try again.";
    case "invalid_state": return "This change order cannot be sent from its current status";
    case "no_recipient": return "No recipient email — add a customer email or provide one";
    case "send_failed": return "The email provider rejected the send. You can retry.";
    default: return "Failed to send change order";
  }
}
