// work-order-factory.ts
// Three GHL-triggered work order operations driven by confirmed Showtime pipeline stages.
//
//   createWorkOrderFromGHLStage  — creates a new WO when a trigger stage fires
//   updateWorkOrderStatusByGHLOpportunity — patches an existing open WO's status
//   flagEstimateFromGHL          — marks estimate_handoff_status when Estimate Sent fires
//
// All functions:
//   • Resolve tenant from locationId internally
//   • Never throw — return typed result or void with console logging
//   • Enforce per-(opportunity, stage) idempotency on create

import { db } from "@/lib/db/client";
import { WorkOrderStatus, ServiceCategory, Priority, EstimateHandoffStatus } from "@/types/work-order";
import type { WorkOrderWithRelations } from "@/types/work-order";
import type { GHLOpportunityStatusChangePayload } from "@/types/ghl";
import { GHL_PIPELINE_STAGES } from "@/lib/constants/ghl-pipeline";
import {
  createWorkOrderFull,
  findByGhlOpportunityIdAndStage,
  findOpenByGhlOpportunityId,
  findAnyByGhlOpportunityId,
} from "@/lib/db/queries/work-orders";
import { findPropertyByGhlContactId } from "@/lib/db/queries/properties";
import { resolveTenantId, resolveGhlUserToTechId } from "./tenant-config";
import {
  extractOppCustomField,
  mapServiceCategoryFromCustomField,
  parseGhlDate,
  mapGhlPriority,
} from "./map-opportunity";
import { ghlFetch } from "./client";

// ─── GHL Calendar API fallback ───────────────────────────────────────────────
// When the webhook body doesn't include an appointment datetime (e.g. the GHL
// workflow template doesn't include those fields yet), we call the Calendar API
// to fetch the appointment details by its ID.

interface GHLCalendarEvent {
  id: string;
  startTime?: string; // ISO datetime
  endTime?: string;   // ISO datetime
}

async function fetchAppointmentFromCalendar(
  appointmentId: string
): Promise<{ date: string; time: string | null; timeEnd: string | null } | null> {
  const result = await ghlFetch<{ event?: GHLCalendarEvent; appointment?: GHLCalendarEvent }>(
    "GET",
    `/calendars/events/${appointmentId}`
  );
  if (!result.ok) {
    console.warn(`[ghl/factory] Calendar API fallback failed for appointment "${appointmentId}": ${result.error}`);
    return null;
  }
  const event = result.data?.event ?? result.data?.appointment;
  if (!event?.startTime) return null;

  const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(event.startTime);
  if (!dateMatch) return null;

  const timeMatch = /T(\d{2}:\d{2})/.exec(event.startTime);
  const timeEndMatch = event.endTime ? /T(\d{2}:\d{2})/.exec(event.endTime) : null;

  return {
    date:    dateMatch[1]!,
    time:    timeMatch ? timeMatch[1]! : null,
    timeEnd: timeEndMatch ? timeEndMatch[1]! : null,
  };
}

// ─── Stage-to-ServiceCategory defaults ───────────────────────────────────────

const STAGE_TO_SERVICE_CATEGORY: Record<string, ServiceCategory> = {
  [GHL_PIPELINE_STAGES.DIAGNOSIS_BOOKED]:  ServiceCategory.POOL_INSPECTION_DIAGNOSTIC,
  [GHL_PIPELINE_STAGES.ESTIMATE_APPROVED]: ServiceCategory.POOL_REPAIR,
};

function resolveServiceCategory(
  stageName: string,
  customFields: GHLOpportunityStatusChangePayload["customFields"]
): ServiceCategory {
  const cfValue = extractOppCustomField(customFields, "GHL_CF_OPP_SERVICE_CAT");
  const fromCustomField = mapServiceCategoryFromCustomField(cfValue);
  if (fromCustomField) return fromCustomField;

  const stageKey = Object.keys(STAGE_TO_SERVICE_CATEGORY).find(
    (k) => k.toLowerCase() === stageName.toLowerCase()
  );
  return stageKey ? STAGE_TO_SERVICE_CATEGORY[stageKey] : ServiceCategory.POOL_REPAIR;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type CreateStageWOResult =
  | { outcome: "created";        workOrder: WorkOrderWithRelations }
  | { outcome: "already_exists"; workOrder: WorkOrderWithRelations }
  | { outcome: "skipped";        reason: string }
  | { outcome: "error";          reason: string };

// ─── createWorkOrderFromGHLStage ─────────────────────────────────────────────
//
// Called when OpportunityStatusChange fires for "Diagnosis Booked" or
// "Estimate Approved". Creates a stage-specific work order.
//
// Idempotency: one WO per (ghl_opportunity_id, ghl_trigger_stage) pair.
// Property lookup: required — if no property found, skip and log.

export async function createWorkOrderFromGHLStage(
  payload: GHLOpportunityStatusChangePayload,
  stageName: string,
  tenantId: string
): Promise<CreateStageWOResult> {
  const tag = `[ghl/factory stage="${stageName}" opp="${payload.id}"]`;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!payload.id) {
    return { outcome: "error", reason: "Missing opportunity id in payload" };
  }

  const contactId = payload.contact?.id;
  if (!contactId) {
    console.warn(`${tag} Missing contact.id — cannot resolve property. Skipping.`);
    return { outcome: "skipped", reason: "Missing contact.id" };
  }

  // ── Idempotency ─────────────────────────────────────────────────────────────
  const existing = await findByGhlOpportunityIdAndStage(payload.id, stageName, tenantId);
  if (existing) {
    console.log(`${tag} Idempotent — WO ${existing.wo_number} already exists for this stage.`);
    return { outcome: "already_exists", workOrder: existing };
  }

  // ── Property lookup (optional) ──────────────────────────────────────────────
  // property_id is nullable — create the WO even if no property exists yet.
  // The operator can link a property later via the inline picker on the WO detail page.
  const property = await findPropertyByGhlContactId(contactId, tenantId);
  if (!property) {
    console.warn(
      `${tag} No Property for ghl_contact_id="${contactId}". ` +
      `Creating WO with property_id=null — link property manually after ContactCreate syncs.`
    );
  }

  // ── Build title and description ─────────────────────────────────────────────
  const isDiagnosis =
    stageName.toLowerCase() === GHL_PIPELINE_STAGES.DIAGNOSIS_BOOKED.toLowerCase();

  // Fall back to contact name from payload when no property record exists yet.
  // Use || not ?? so empty strings also fall through to the next option.
  // The webhook normalizer stamps contact.name from multiple key variants before
  // this factory runs, so payload.contact?.name should already be populated.
  // Direct flat-payload keys are checked as final fallbacks.
  const raw = payload as unknown as Record<string, string>;
  const customerName =
    property?.customer_name ||
    payload.contact?.name ||
    raw.name ||
    raw.contactName ||
    raw.fullName ||
    "New Lead";

  const title = isDiagnosis
    ? `Diagnosis — ${customerName}`
    : `Approved Job — ${customerName}`;

  const description = isDiagnosis
    ? "Initial pool diagnosis and assessment"
    : "Customer approved estimate — ready to schedule";

  // ── Resolve other fields ────────────────────────────────────────────────────
  const serviceCategory = resolveServiceCategory(stageName, payload.customFields);
  const priority = mapGhlPriority(
    extractOppCustomField(payload.customFields, "GHL_CF_OPP_PRIORITY")
  );
  const techId = resolveGhlUserToTechId(payload.assignedTo);

  // ── Appointment date/time — three-step resolution ────────────────────────────
  // 1. Private fields injected by the webhook normalizer from the webhook body
  // 2. Legacy customFields channel (env-var keyed — only works if GHL_CF_OPP_SCHEDULED_DATE is set)
  // 3. GHL Calendar API fallback when appointmentId was captured
  const rawPayload = payload as unknown as Record<string, string | undefined>;
  let scheduledDate: string | undefined =
    rawPayload._appointmentDate ??
    parseGhlDate(extractOppCustomField(payload.customFields, "GHL_CF_OPP_SCHEDULED_DATE"));

  let scheduledTimeStart: string | undefined = rawPayload._appointmentTime;
  let scheduledTimeEnd: string | undefined;

  if (!scheduledDate && rawPayload._appointmentId) {
    console.log(`${tag} No date in webhook body — trying Calendar API fallback for appointment "${rawPayload._appointmentId}"`);
    const calData = await fetchAppointmentFromCalendar(rawPayload._appointmentId);
    if (calData) {
      scheduledDate      = calData.date;
      scheduledTimeStart = calData.time ?? undefined;
      scheduledTimeEnd   = calData.timeEnd ?? undefined;
      console.log(`${tag} Calendar API fallback success — date=${scheduledDate} time=${scheduledTimeStart ?? "none"}`);
    } else {
      console.warn(`${tag} Calendar API fallback returned nothing — scheduled_date will be null`);
    }
  }

  if (!scheduledDate) {
    console.warn(`${tag} No appointment date found in webhook body or Calendar API — WO will be created without scheduled_date`);
  }

  const propertyAddress = property
    ? [
        property.address_line1,
        property.address_line2,
        `${property.city}, ${property.state} ${property.zip}`,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  // ── Create ──────────────────────────────────────────────────────────────────
  // A unique violation (23505) means a concurrent delivery inserted this row
  // between our idempotency check and this insert — or that a legacy
  // opportunity-level unique index still constrains the table. Either way the
  // business outcome is "the row exists", so re-read the winner and report
  // idempotent success instead of surfacing a masked failure.
  let workOrder: WorkOrderWithRelations;
  try {
    workOrder = await createWorkOrderFull(
    {
      tenant_id:               tenantId,
      property_id:             property?.id ?? null,
      ghl_contact_id:          contactId,
      ghl_opportunity_id:      payload.id,
      ghl_trigger_stage:       stageName,
      title,
      description,
      status:                  WorkOrderStatus.NEW,
      priority,
      service_category:        serviceCategory,
      assigned_technician_id:  techId,
      scheduled_date:          scheduledDate,
      scheduled_time_start:    scheduledTimeStart,
      scheduled_time_end:      scheduledTimeEnd,
      estimate_handoff_status: EstimateHandoffStatus.NOT_NEEDED,
    },
    propertyAddress,
    customerName
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "23505" || message.includes("duplicate key")) {
      const winner = await findByGhlOpportunityIdAndStage(payload.id, stageName, tenantId);
      if (winner) {
        console.log(`${tag} Unique violation resolved idempotently — existing WO ${winner.wo_number}.`);
        return { outcome: "already_exists", workOrder: winner };
      }
      // Constrained by something other than (opportunity, stage) — most likely
      // the legacy opportunity-level unique index, which would block the second
      // trigger stage for an opportunity that already has a work order.
      return {
        outcome: "error",
        reason: `unique violation with no matching (opportunity, stage) row — check for a stale opportunity-level unique index: ${message}`,
      };
    }
    throw err;
  }

  // Logged by WO number/property-linked flag only -- customerName is PII and
  // doesn't add debugging value once the WO number is present (security-audit M15).
  console.log(
    `${tag} Created WO ${workOrder.wo_number} ` +
    `category="${workOrder.service_category}" ` +
    `scheduledDate="${scheduledDate ?? "none"}" propertyLinked=${!!property}`
  );

  return { outcome: "created", workOrder };
}

// ─── updateWorkOrderStatusByGHLOpportunity ────────────────────────────────────
//
// Called when a pipeline stage change should update an existing WO's status.
// Finds the most recently created open (non-cancelled, non-completed) WO for
// the opportunity. This targets the correct WO as the pipeline advances:
//   • Diagnosis Completed → updates the Diagnosis Booked WO (only open WO)
//   • In Progress / Completed/Won → updates the Estimate Approved WO (most recent open WO)

/**
 * Returns the updated work order's number, or null when no open work order
 * matched. A DB failure throws rather than returning null, so the caller can
 * tell "nothing to update" (a correct no-op) apart from "the update failed".
 */
export async function updateWorkOrderStatusByGHLOpportunity(
  ghlOpportunityId: string,
  newStatus: string,
  stageName: string,
  tenantId: string
): Promise<string | null> {
  const tag = `[ghl/factory stage="${stageName}" opp="${ghlOpportunityId}"]`;

  const workOrder = await findOpenByGhlOpportunityId(ghlOpportunityId, tenantId);

  if (!workOrder) {
    console.warn(
      `${tag} No open WO found for opportunity "${ghlOpportunityId}" — stage "${stageName}". ` +
      `WO may already be completed or cancelled.`
    );
    return null;
  }

  const isCompleting = newStatus === WorkOrderStatus.COMPLETED;
  const updatePayload: Record<string, unknown> = {
    status:     newStatus,
    updated_at: new Date().toISOString(),
  };
  if (isCompleting) {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { error } = await db
    .from("work_orders")
    .update(updatePayload)
    .eq("id", workOrder.id)
    .eq("tenant_id", tenantId);

  if (error) {
    // Throw rather than swallow — the caller classifies this as retryable so
    // the delivery is not recorded as processed when nothing changed.
    throw new Error(`[ghl/factory] failed to update WO ${workOrder.wo_number}: ${error.message}`);
  }

  // Insert status history record (non-blocking on failure)
  const { error: histErr } = await db
    .from("work_order_status_history")
    .insert({
      work_order_id: workOrder.id,
      tenant_id:     tenantId,
      from_status:   workOrder.status,
      to_status:     newStatus,
      changed_by:    "ghl_webhook",
      note:          `GHL stage: ${stageName}`,
    });

  if (histErr) {
    console.warn(`${tag} Status history insert failed (non-fatal): ${histErr.message}`);
  }

  console.log(
    `${tag} Updated WO ${workOrder.wo_number} ` +
    `status: ${workOrder.status} → ${newStatus}`
  );

  return workOrder.wo_number;
}

// ─── flagEstimateFromGHL ──────────────────────────────────────────────────────
//
// Called when GHL stage moves to "Estimate Sent".
// Finds the Diagnosis Booked WO for this opportunity and updates its
// estimate_handoff_status to ESTIMATE_SENT. Also patches the estimate_handoffs
// record if one exists.

/**
 * Returns the flagged work order's number, or null when no work order matched.
 * DB failures throw so the caller can classify them as retryable.
 */
export async function flagEstimateFromGHL(
  ghlOpportunityId: string,
  tenantId: string
): Promise<string | null> {
  const tag = `[ghl/factory stage="Estimate Sent" opp="${ghlOpportunityId}"]`;

  // Find the Diagnosis Booked WO (estimate relates to the diagnostic visit)
  const workOrder = await findAnyByGhlOpportunityId(ghlOpportunityId, tenantId);

  if (!workOrder) {
    console.warn(
      `${tag} No WO found for opportunity "${ghlOpportunityId}". ` +
      `Cannot flag estimate. Skipping.`
    );
    return null;
  }

  // Update work order estimate_handoff_status
  const { error: woErr } = await db
    .from("work_orders")
    .update({
      estimate_handoff_status: EstimateHandoffStatus.ESTIMATE_SENT,
      updated_at:              new Date().toISOString(),
    })
    .eq("id", workOrder.id)
    .eq("tenant_id", tenantId);

  if (woErr) {
    throw new Error(`[ghl/factory] failed to flag estimate on WO ${workOrder.wo_number}: ${woErr.message}`);
  }

  // Best-effort: update estimate_handoffs record if one exists
  const { error: ehErr } = await db
    .from("estimate_handoffs")
    .update({
      status:    EstimateHandoffStatus.ESTIMATE_SENT,
    })
    .eq("work_order_id", workOrder.id)
    .eq("tenant_id", tenantId);

  if (ehErr) {
    console.warn(`${tag} estimate_handoffs update failed (non-fatal): ${ehErr.message}`);
  }

  console.log(
    `${tag} Flagged estimate as ESTIMATE_SENT on WO ${workOrder.wo_number}`
  );

  return workOrder.wo_number;
}
