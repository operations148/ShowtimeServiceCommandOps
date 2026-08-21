import { type NextRequest, NextResponse } from "next/server";
import { createHmac, createHash, timingSafeEqual, randomUUID } from "crypto";
import { normalizeGHLPayload } from "@/lib/ghl/normalize-payload";
import { dispatch } from "@/lib/ghl/dispatch";
import {
  type WebhookOutcome,
  ledgerStatusFor,
  httpStatusFor,
  isTerminalLedgerStatus,
} from "@/lib/ghl/webhook-outcome";
import { logger } from "@/lib/security/logger";
import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Request verification — supports two modes:
//
// MODE 1 — GHL Workflow Webhook (current / primary)
//   GHL Automations → Workflow → Outbound Webhook action POSTs to this endpoint.
//   Auth: add a custom header in the workflow action:
//     Key:   Authorization
//     Value: Bearer <GHL_WEBHOOK_SECRET>
//   OR append ?token=<GHL_WEBHOOK_SECRET> to the webhook URL (non-production).
//
// MODE 2 — GHL Marketplace Webhook (future)
//   GHL signs the body with HMAC-SHA256; signature sent as "x-ghl-signature".
//   Automatically used when that header is present.
// ---------------------------------------------------------------------------

function verifyHmac(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  let incomingBuf: Buffer;
  try {
    incomingBuf = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }
  const expectedBuf = Buffer.from(expected, "hex");
  if (incomingBuf.length !== expectedBuf.length) return false;
  try {
    return timingSafeEqual(incomingBuf, expectedBuf);
  } catch {
    return false;
  }
}

interface VerifyResult {
  ok: boolean;
  mode: "bearer" | "query" | "hmac" | "none";
  reason?: string;
}

// Constant-time string compare (security-audit L1 — the bearer/query paths
// previously used plain `===`, unlike the HMAC path's timingSafeEqual).
function constantTimeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyRequest(request: NextRequest, rawBody: string, secret: string): VerifyResult {
  const secretTrimmed = secret.trim();

  // Mode 1a: Bearer token in Authorization header (GHL Custom Webhook)
  const authHeader = (request.headers.get("authorization") ?? "").trim();
  const hasAuthHeader = authHeader.length > 0;
  if (hasAuthHeader) {
    // GHL sends "Bearer <token>" — strip prefix and compare trimmed values
    const bearerPrefix = "bearer ";
    const headerLower = authHeader.toLowerCase();
    if (headerLower.startsWith(bearerPrefix)) {
      const tokenFromHeader = authHeader.slice(bearerPrefix.length).trim();
      if (constantTimeStringEquals(tokenFromHeader, secretTrimmed)) {
        return { ok: true, mode: "bearer" };
      }
      // Header present but token doesn't match — no length/char-match detail
      // in the reason string (security-audit M14 leaked secret metadata here).
      return { ok: false, mode: "none", reason: "bearer_mismatch" };
    }
    // Authorization header present but not Bearer format
    return { ok: false, mode: "none", reason: "auth_header_not_bearer" };
  }

  // Mode 1b: Token in query string — disabled in production (security-audit
  // "disable query-token authentication in production": a token in the URL
  // is logged by proxies/browsers/access logs far more readily than a header).
  if (process.env.NODE_ENV !== "production") {
    const urlToken = (request.nextUrl.searchParams.get("token") ?? "").trim();
    if (urlToken) {
      if (constantTimeStringEquals(urlToken, secretTrimmed)) {
        return { ok: true, mode: "query" };
      }
      return { ok: false, mode: "none", reason: "query_token_mismatch" };
    }
  }

  // Mode 2: HMAC signature header (GHL Marketplace webhooks, future)
  const sigHeader = request.headers.get("x-ghl-signature") ?? "";
  if (sigHeader) {
    const ok = verifyHmac(rawBody, sigHeader, secretTrimmed);
    return ok ? { ok: true, mode: "hmac" } : { ok: false, mode: "none", reason: "hmac_mismatch" };
  }

  return { ok: false, mode: "none", reason: "no_auth_provided" };
}

// ---------------------------------------------------------------------------
// POST /api/ghl/webhooks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const correlationId = randomUUID();

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // ── Request verification ───────────────────────────────────────────────────
  const secret = process.env.GHL_WEBHOOK_SECRET;
  const secretConfigured = !!secret && secret.trim().length > 0;

  if (!secretConfigured) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[ghl/webhooks] rejected — GHL_WEBHOOK_SECRET not set in production", { correlationId });
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    logger.warn("[ghl/webhooks] GHL_WEBHOOK_SECRET not set — verification skipped (dev only)", { correlationId });
  } else {
    const result = verifyRequest(request, rawBody, secret!);
    if (!result.ok) {
      logger.warn("[ghl/webhooks] unauthorized", { correlationId, reason: result.reason ?? "unknown" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Parse payload BEFORE reserving the ledger ──────────────────────────────
  // Reserving first meant an unparseable body left a permanent 'processing' row
  // that nothing would ever resolve.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("[ghl/webhooks] invalid JSON body", { correlationId });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    logger.warn("[ghl/webhooks] body is not a JSON object", { correlationId });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Idempotency ledger ─────────────────────────────────────────────────────
  // GHL doesn't send a stable event ID on Custom Webhook deliveries, so a hash
  // of the verified raw body is the dedup key (defence in depth on top of the
  // per-(opportunity, stage) business idempotency the factory enforces).
  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const hashPrefix = payloadHash.slice(0, 12);

  const { data: existingEvent, error: lookupError } = await db
    .from("webhook_events")
    .select("id, processing_status, attempt_count")
    .eq("provider", "ghl")
    .eq("event_id", payloadHash)
    .maybeSingle();

  if (lookupError) {
    // Previously ignored. A failed lookup means we cannot reason about
    // duplicates at all, so treat it as retryable rather than pressing on.
    logger.error("[ghl/webhooks] ledger lookup failed", {
      correlationId, hashPrefix, error: lookupError.message,
    });
    return NextResponse.json({ error: "Temporarily unavailable" }, { status: 500 });
  }

  if (isTerminalLedgerStatus(existingEvent?.processing_status)) {
    logger.info("[ghl/webhooks] duplicate delivery — already finalized", {
      correlationId, hashPrefix, priorStatus: existingEvent!.processing_status,
    });
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  const attemptCount = (existingEvent?.attempt_count ?? 0) + 1;

  if (!existingEvent) {
    const { error: insertError } = await db.from("webhook_events").insert({
      provider: "ghl",
      event_id: payloadHash,
      payload_hash: payloadHash,
      processing_status: "processing",
      attempt_count: attemptCount,
    });
    // A unique-violation here means a concurrent delivery of the identical body
    // won the race; that request owns processing, so this one stops cleanly.
    if (insertError) {
      const isRace = insertError.code === "23505";
      logger[isRace ? "info" : "error"](
        isRace
          ? "[ghl/webhooks] concurrent duplicate — yielding to the in-flight delivery"
          : "[ghl/webhooks] ledger insert failed",
        { correlationId, hashPrefix, error: insertError.message },
      );
      return isRace
        ? NextResponse.json({ received: true, duplicate: true }, { status: 200 })
        : NextResponse.json({ error: "Temporarily unavailable" }, { status: 500 });
    }
  } else {
    await db
      .from("webhook_events")
      .update({ processing_status: "processing", attempt_count: attemptCount })
      .eq("provider", "ghl")
      .eq("event_id", payloadHash);
  }

  // ── Normalize ──────────────────────────────────────────────────────────────
  const { payload, presence, receivedKeys } = normalizeGHLPayload(parsed);

  logger.info("[ghl/webhooks] received", {
    correlationId,
    hashPrefix,
    attempt: attemptCount,
    eventType: payload.type,
    receivedKeys: receivedKeys.join(","),
    hasLocationId:    presence.locationId,
    hasOpportunityId: presence.opportunityId,
    hasContactId:     presence.contactId,
    hasStageName:     presence.stageName,
    hasStageId:       presence.stageId,
  });

  // ── Dispatch ───────────────────────────────────────────────────────────────
  // Awaited: Vercel freezes the execution context once the Response is
  // returned, so fire-and-forget is unreliable in serverless.
  let outcome: WebhookOutcome;
  try {
    outcome = await dispatch(payload);
  } catch (err) {
    // An exception is by definition unexpected — classify as retryable so the
    // ledger stays replayable rather than being sealed as a success.
    outcome = {
      code: "failed_retryable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const ledgerStatus = ledgerStatusFor(outcome.code);
  const httpStatus = httpStatusFor(outcome.code);

  const { error: updateError } = await db
    .from("webhook_events")
    .update({
      processing_status: ledgerStatus,
      outcome_code:      outcome.code,
      last_error:        ledgerStatus.startsWith("failed") ? (outcome.detail ?? outcome.code) : null,
      processed_at:      new Date().toISOString(),
    })
    .eq("provider", "ghl")
    .eq("event_id", payloadHash);

  if (updateError) {
    // Do not claim success we failed to record — a row stuck in 'processing'
    // that we reported 200 for is precisely the invisible-failure pattern.
    logger.error("[ghl/webhooks] ledger finalize failed", {
      correlationId, hashPrefix, outcome: outcome.code, error: updateError.message,
    });
    return NextResponse.json({ error: "Temporarily unavailable" }, { status: 500 });
  }

  logger[ledgerStatus.startsWith("failed") ? "warn" : "info"]("[ghl/webhooks] processed", {
    correlationId,
    hashPrefix,
    outcome: outcome.code,
    ledgerStatus,
    httpStatus,
    detail: outcome.detail,
    workOrder: outcome.workOrderNumber,
  });

  return NextResponse.json(
    { received: true, outcome: outcome.code, ...(outcome.detail ? { detail: outcome.detail } : {}) },
    { status: httpStatus },
  );
}
