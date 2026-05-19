import { type NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  GHLWebhookPayload,
  GHLOpportunityStatusChangePayload,
} from "@/types/ghl";
import { upsertPropertyFromGHL } from "@/lib/ghl/upsert-property-from-ghl";
import { createWorkOrderFromAppointment } from "@/lib/ghl/create-work-order-from-appointment";
import {
  createWorkOrderFromGHLStage,
  updateWorkOrderStatusByGHLOpportunity,
  flagEstimateFromGHL,
} from "@/lib/ghl/work-order-factory";
import {
  STAGES_THAT_CREATE_WORK_ORDER,
  STAGES_THAT_UPDATE_STATUS,
  STAGES_THAT_FLAG_ESTIMATE,
} from "@/lib/constants/ghl-pipeline";
import { resolveTenantId } from "@/lib/ghl/tenant-config";

// ---------------------------------------------------------------------------
// Request verification — supports two modes:
//
// MODE 1 — GHL Workflow Webhook (current / primary)
//   GHL Automations → Workflow → Outbound Webhook action POSTs to this endpoint.
//   Auth: add a custom header in the workflow action:
//     Key:   Authorization
//     Value: Bearer <GHL_WEBHOOK_SECRET>
//   OR append ?token=<GHL_WEBHOOK_SECRET> to the webhook URL.
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
      if (tokenFromHeader === secretTrimmed) {
        return { ok: true, mode: "bearer" };
      }
      // Header present but token doesn't match
      return {
        ok: false,
        mode: "none",
        reason: `bearer_mismatch | headerTokenLen=${tokenFromHeader.length} secretLen=${secretTrimmed.length} firstCharMatch=${tokenFromHeader[0] === secretTrimmed[0]}`,
      };
    }
    // Authorization header present but not Bearer format
    return {
      ok: false,
      mode: "none",
      reason: `auth_header_not_bearer | scheme=${authHeader.split(" ")[0]}`,
    };
  }

  // Mode 1b: Token in query string (fallback when custom headers not available)
  const urlToken = (request.nextUrl.searchParams.get("token") ?? "").trim();
  if (urlToken) {
    if (urlToken === secretTrimmed) {
      return { ok: true, mode: "query" };
    }
    return {
      ok: false,
      mode: "none",
      reason: `query_token_mismatch | tokenLen=${urlToken.length} secretLen=${secretTrimmed.length}`,
    };
  }

  // Mode 2: HMAC signature header (GHL Marketplace webhooks, future)
  const sigHeader = request.headers.get("x-ghl-signature") ?? "";
  if (sigHeader) {
    const ok = verifyHmac(rawBody, sigHeader, secretTrimmed);
    return ok ? { ok: true, mode: "hmac" } : { ok: false, mode: "none", reason: "hmac_mismatch" };
  }

  return { ok: false, mode: "none", reason: "no_auth_provided | no Authorization header, ?token param, or x-ghl-signature" };
}

// ---------------------------------------------------------------------------
// Field extraction helpers — GHL Custom Webhook sends flat key-value bodies;
// field names vary slightly between templates and GHL versions. These helpers
// check multiple key name variants at the top level and in an optional
// nested `data` envelope, returning the first non-empty string found.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getField(payload: Record<string, any>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = payload[key];
    if (v !== undefined && v !== null && v !== "") return String(v);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const nested = payload.data?.[key];
    if (nested !== undefined && nested !== null && nested !== "") return String(nested);
  }
  return null;
}

// Parse a date string from GHL into "YYYY-MM-DD" for the scheduled_date column.
// Handles ISO timestamps, date-only strings, and US "MM/DD/YYYY" format.
function parseAppointmentDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // ISO timestamp: "2026-05-20T10:00:00.000Z" or with offset
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  // Date-only: "2026-05-20"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // US format: "5/20/2026" or "05/20/2026"
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/ghl/webhooks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // ── Request verification ───────────────────────────────────────────────────
  const secret = process.env.GHL_WEBHOOK_SECRET;
  const secretConfigured = !!secret && secret.trim().length > 0;

  // Safe diagnostic log — never logs secret value
  console.log(
    "[ghl/webhooks] Incoming POST | secretConfigured=%s | authHeader=%s | queryToken=%s | hmacHeader=%s",
    secretConfigured,
    !!(request.headers.get("authorization")),
    !!(request.nextUrl.searchParams.get("token")),
    !!(request.headers.get("x-ghl-signature")),
  );

  if (!secretConfigured) {
    if (process.env.NODE_ENV === "production") {
      console.error("[ghl/webhooks] REJECTED: GHL_WEBHOOK_SECRET is not set in production env");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    console.warn("[ghl/webhooks] GHL_WEBHOOK_SECRET not set — verification skipped (dev mode)");
  } else {
    const result = verifyRequest(request, rawBody, secret!);
    console.log("[ghl/webhooks] Auth result | ok=%s mode=%s reason=%s", result.ok, result.mode, result.reason ?? "—");
    if (!result.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Parse payload ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    console.error("[ghl/webhooks] Failed to parse JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalize type — GHL key-value body may add whitespace or quotes
  const rawType = String(raw.type ?? "").trim().replace(/^["']|["']$/g, "");

  // Normalize flat GHL key-value body fields into the nested shape our handler expects.
  // GHL Custom Webhook "Body (Key and Value)" sends flat fields like pipelineStageName
  // instead of the nested pipelineStage.name that the handler reads.
  if (!raw.pipelineStage && (raw.pipelineStageName || raw.pipelineStageId)) {
    raw.pipelineStage = {
      id:   String(raw.pipelineStageId ?? ""),
      name: String(raw.pipelineStageName ?? ""),
    };
  }

  // Extract contact name checking all variants GHL may use.
  // "name" is the top-level field in a flat GHL workflow body.
  // "contactName" / "fullName" appear in some GHL template variants.
  const contactName = getField(raw, "name", "contactName", "fullName", "contact_name", "firstName");

  if (!raw.contact && (raw.contactId || raw.contactEmail || raw.contactPhone || contactName)) {
    raw.contact = {
      id:    String(raw.contactId ?? ""),
      name:  contactName ?? "",
      email: String(raw.contactEmail ?? ""),
      phone: String(raw.contactPhone ?? ""),
    };
  } else if (raw.contact && !raw.contact.name && contactName) {
    // Fill in name if the contact object exists but name is blank
    raw.contact.name = contactName;
  }

  // Extract appointment date — GHL template field name varies:
  //   appointmentStartTime  (recommended template key)
  //   appointmentStart      (some GHL versions)
  //   appointmentS          (truncated key seen in GHL UI screenshot)
  //   appointment_start / appointmentDate (alternate naming)
  const appointmentStart = getField(
    raw,
    "appointmentStartTime",
    "appointmentStart",
    "appointmentS",
    "appointment_start",
    "appointmentDate",
    "appointment_only_start_date",
  );
  if (appointmentStart && !Array.isArray(raw.customFields)) {
    const dateValue = parseAppointmentDate(appointmentStart) ?? appointmentStart;
    raw.customFields = [{ id: "GHL_CF_OPP_SCHEDULED_DATE", fieldValue: dateValue }];
  }

  // Diagnostic log — shows exactly what arrived so we can see name/date extraction
  console.log(
    "[GHL Webhook] Raw payload keys: %s",
    Object.keys(raw).join(", "),
  );
  console.log(
    "[GHL Webhook] Key fields — name=%s contactId=%s appointmentStart=%s stage=%s",
    contactName ?? "(none)",
    raw.contactId ?? "(none)",
    appointmentStart ?? "(none)",
    raw.pipelineStageName ?? raw.pipelineStage?.name ?? "(none)",
  );

  // Stamp the normalized type back onto the object
  raw.type = rawType;

  const payload = raw as unknown as GHLWebhookPayload;

  // Log raw type with char codes to catch hidden whitespace/encoding issues
  const typeCharCodes = rawType.split("").slice(0, 6).map((c) => c.charCodeAt(0)).join(",");
  console.log(
    "[ghl/webhooks] Received event | rawType=%s len=%d firstChars=[%s] locationId=%s stage=%s",
    rawType,
    rawType.length,
    typeCharCodes,
    raw.locationId,
    raw.pipelineStage?.name ?? raw.pipelineStageName ?? "—",
  );

  // ── Dispatch ───────────────────────────────────────────────────────────────
  // Awaited — Vercel freezes the execution context immediately after the Response
  // is returned, so fire-and-forget is unreliable in serverless. We await here
  // and always return 200 so GHL never retries due to a processing error.
  try {
    await dispatch(payload);
  } catch (err) {
    console.error("[ghl/webhooks] Unhandled dispatch error:", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

async function dispatch(payload: GHLWebhookPayload): Promise<void> {
  // Use a plain string for the switch so TypeScript narrowing doesn't silently
  // hide a runtime mismatch caused by GHL body whitespace/encoding.
  const eventType = (payload.type as string).trim();
  switch (eventType) {

    case "OpportunityStatusChange": {
      const opp = payload as GHLOpportunityStatusChangePayload;

      // Resolve tenant first — required for all stage handlers
      const tenantId = resolveTenantId(opp.locationId);
      if (!tenantId) {
        console.error(
          `[ghl/webhooks] OpportunityStatusChange — unknown locationId "${opp.locationId}". Discarding.`
        );
        break;
      }

      // Discard terminal non-job statuses
      if (opp.status === "lost" || opp.status === "abandoned") {
        console.log(`[ghl/webhooks] OpportunityStatusChange — status="${opp.status}", discarding.`);
        break;
      }

      const stageName = (opp.pipelineStage?.name ?? "").trim();
      const stageNorm = stageName.toLowerCase();

      // ── CREATE: Diagnosis Booked or Estimate Approved ──────────────────────
      if (STAGES_THAT_CREATE_WORK_ORDER.some((s) => s.toLowerCase() === stageNorm)) {
        const result = await createWorkOrderFromGHLStage(opp, stageName, tenantId);
        switch (result.outcome) {
          case "created":
            console.log(
              `[ghl/webhooks] Stage "${stageName}" → created WO ${result.workOrder.wo_number}`
            );
            break;
          case "already_exists":
            console.log(
              `[ghl/webhooks] Stage "${stageName}" → idempotent, existing WO ${result.workOrder.wo_number}`
            );
            break;
          case "skipped":
            console.log(`[ghl/webhooks] Stage "${stageName}" → skipped: ${result.reason}`);
            break;
          case "error":
            console.error(`[ghl/webhooks] Stage "${stageName}" → error: ${result.reason}`);
            break;
        }
        break;
      }

      // ── UPDATE STATUS: Diagnosis Completed, In Progress, Completed/Won ─────
      const updateStatusValue = Object.entries(STAGES_THAT_UPDATE_STATUS).find(
        ([k]) => k.toLowerCase() === stageNorm
      )?.[1];

      if (updateStatusValue) {
        await updateWorkOrderStatusByGHLOpportunity(opp.id, updateStatusValue, stageName, tenantId);
        break;
      }

      // Fallback: GHL top-level "won" without a matching stage → mark completed
      if (opp.status === "won") {
        await updateWorkOrderStatusByGHLOpportunity(opp.id, "completed", "won", tenantId);
        break;
      }

      // ── FLAG ESTIMATE: Estimate Sent ───────────────────────────────────────
      if (STAGES_THAT_FLAG_ESTIMATE.some((s) => s.toLowerCase() === stageNorm)) {
        await flagEstimateFromGHL(opp.id, tenantId);
        break;
      }

      // All other stages — no action
      console.log(`[ghl/webhooks] Stage "${stageName}" — no action configured`);
      break;
    }

    case "ContactCreate":
    case "ContactUpdate": {
      const result = await upsertPropertyFromGHL(payload as import("@/types/ghl").GHLContactCreatePayload);
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
      const result = await createWorkOrderFromAppointment(payload as import("@/types/ghl").GHLAppointmentBookedPayload);
      switch (result.outcome) {
        case "created":
          console.log(
            `[ghl/webhooks] AppointmentBooked → created WO ${result.workOrder.wo_number}`
          );
          break;
        case "already_exists":
          console.log(
            `[ghl/webhooks] AppointmentBooked → idempotent, existing WO ${result.workOrder.wo_number}`
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
      console.warn("[ghl/webhooks] Unknown event type:", eventType);
    }
  }
}
