import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { GHLWebhookPayload } from "@/types/ghl";
import { createWorkOrderFromGHL } from "@/lib/ghl/create-work-order-from-ghl";

// ---------------------------------------------------------------------------
// Signature verification
// GHL signs the raw request body with HMAC-SHA256 using GHL_WEBHOOK_SECRET.
// The signature is sent in the "x-ghl-signature" header as a hex digest.
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  let incomingBuf: Buffer;
  try {
    incomingBuf = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }

  const expectedBuf = Buffer.from(expected, "hex");

  // timingSafeEqual requires equal-length buffers
  if (incomingBuf.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(incomingBuf, expectedBuf);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/ghl/webhooks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Read raw body first — must happen before any JSON parsing so the HMAC is
  // computed over the exact bytes GHL sent.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // ── Signature verification ─────────────────────────────────────────────────
  const secret = process.env.GHL_WEBHOOK_SECRET;

  if (secret) {
    const signatureHeader = request.headers.get("x-ghl-signature") ?? "";
    if (!verifySignature(rawBody, signatureHeader, secret)) {
      console.warn("[ghl/webhooks] Rejected: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // No secret configured — accept but warn. Dev/test mode only.
    console.warn(
      "[ghl/webhooks] GHL_WEBHOOK_SECRET is not set — signature verification skipped (dev mode)"
    );
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  let payload: GHLWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as GHLWebhookPayload;
  } catch {
    console.error("[ghl/webhooks] Failed to parse JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Log ────────────────────────────────────────────────────────────────────
  console.log(
    "[ghl/webhooks] Received event | type=%s locationId=%s id=%s",
    payload.type,
    payload.locationId,
    "id" in payload ? payload.id : "(no id)"
  );
  console.log("[ghl/webhooks] Raw payload:", rawBody);

  // ── Dispatch ───────────────────────────────────────────────────────────────
  // Always return 200 after verification — processing errors must not cause
  // GHL to retry (which would create duplicate work orders).
  try {
    dispatch(payload);
  } catch (err) {
    // Unexpected error in dispatch — log and swallow so GHL gets its 200.
    console.error("[ghl/webhooks] Unhandled dispatch error:", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

function dispatch(payload: GHLWebhookPayload): void {
  switch (payload.type) {
    case "OpportunityStatusChange": {
      const result = createWorkOrderFromGHL(payload);
      switch (result.outcome) {
        case "created":
          console.log(
            `[ghl/webhooks] OpportunityStatusChange → created WorkOrder ${result.workOrder.wo_number}`
          );
          break;
        case "already_exists":
          console.log(
            `[ghl/webhooks] OpportunityStatusChange → idempotent, existing WorkOrder ${result.workOrder.wo_number}`
          );
          break;
        case "skipped":
          console.log(`[ghl/webhooks] OpportunityStatusChange → skipped: ${result.reason}`);
          break;
        case "error":
          console.error(`[ghl/webhooks] OpportunityStatusChange → error: ${result.reason}`);
          break;
      }
      break;
    }

    case "ContactCreate":
    case "ContactUpdate":
    case "ContactDelete":
    case "ContactTagApplied":
    case "OpportunityCreate":
    case "OpportunityStageUpdate":
    case "OpportunityAssignedToUpdate":
    case "OpportunityMonetaryValueUpdate":
    case "OpportunityDelete":
    case "AppointmentBooked":
      console.log(`[ghl/webhooks] Event type "${payload.type}" received — not handled in Phase 1`);
      break;

    default: {
      // TypeScript exhaustiveness guard — catches new event types added to GHLWebhookPayload.
      const unhandled: never = payload;
      console.warn("[ghl/webhooks] Unknown event type:", (unhandled as GHLWebhookPayload).type);
    }
  }
}
