import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { GHLWebhookPayload } from "@/types/ghl";
import { createWorkOrderFromGHL } from "@/lib/ghl/create-work-order-from-ghl";
import { upsertPropertyFromGHL } from "@/lib/ghl/upsert-property-from-ghl";
import { createWorkOrderFromAppointment } from "@/lib/ghl/create-work-order-from-appointment";

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
    "[ghl/webhooks] Received event | type=%s locationId=%s",
    payload.type,
    payload.locationId,
  );

  // ── Dispatch ───────────────────────────────────────────────────────────────
  // Fire-and-forget — always return 200 after verification so GHL doesn't retry.
  // Processing errors are logged server-side; duplicates prevented by idempotency check.
  void dispatch(payload).catch((err) => {
    console.error("[ghl/webhooks] Unhandled dispatch error:", err);
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

async function dispatch(payload: GHLWebhookPayload): Promise<void> {
  switch (payload.type) {
    case "OpportunityStatusChange": {
      const result = await createWorkOrderFromGHL(payload);
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
    case "ContactUpdate": {
      const result = await upsertPropertyFromGHL(payload);
      switch (result.outcome) {
        case "created":
          console.log(
            `[ghl/webhooks] ${payload.type} → created Property ${result.property.id} (${result.property.customer_name})`
          );
          break;
        case "updated":
          console.log(
            `[ghl/webhooks] ${payload.type} → updated Property ${result.property.id} (${result.property.customer_name})`
          );
          break;
        case "skipped":
          console.log(`[ghl/webhooks] ${payload.type} → skipped: ${result.reason}`);
          break;
        case "error":
          console.error(`[ghl/webhooks] ${payload.type} → error: ${result.reason}`);
          break;
      }
      break;
    }

    case "AppointmentBooked": {
      const result = await createWorkOrderFromAppointment(payload);
      switch (result.outcome) {
        case "created":
          console.log(
            `[ghl/webhooks] AppointmentBooked → created WorkOrder ${result.workOrder.wo_number}`
          );
          break;
        case "already_exists":
          console.log(
            `[ghl/webhooks] AppointmentBooked → idempotent, existing WorkOrder ${result.workOrder.wo_number}`
          );
          break;
        case "skipped":
          console.log(`[ghl/webhooks] AppointmentBooked → skipped: ${result.reason}`);
          break;
        case "error":
          console.error(`[ghl/webhooks] AppointmentBooked → error: ${result.reason}`);
          break;
      }
      break;
    }

    case "ContactDelete":
    case "ContactTagApplied":
    case "OpportunityCreate":
    case "OpportunityStageUpdate":
    case "OpportunityAssignedToUpdate":
    case "OpportunityMonetaryValueUpdate":
    case "OpportunityDelete":
      break;

    default: {
      const unhandled: never = payload;
      console.warn("[ghl/webhooks] Unknown event type:", (unhandled as GHLWebhookPayload).type);
    }
  }
}
