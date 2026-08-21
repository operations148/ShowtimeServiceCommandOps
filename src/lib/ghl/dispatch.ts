// dispatch.ts
//
// Routes one normalized GHL webhook payload to the right handler and returns a
// typed outcome describing exactly what was decided.
//
// This lives outside the route handler so the routing rules can be regression-
// tested directly, without HTTP or Next.js runtime involvement.
//
// The contract every branch obeys: return a WebhookOutcome, never undefined and
// never a bare success. Previously this was `Promise<void>`, so the caller had
// no way to tell a created work order from a silently discarded delivery — and
// marked both as processed.

import type {
  GHLWebhookPayload,
  GHLOpportunityStatusChangePayload,
  GHLContactCreatePayload,
  GHLAppointmentBookedPayload,
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
import type { WebhookOutcome } from "@/lib/ghl/webhook-outcome";

async function dispatchOpportunityStatusChange(
  opp: GHLOpportunityStatusChangePayload,
): Promise<WebhookOutcome> {
  if (!opp.locationId) {
    return { code: "rejected_validation", detail: "missing locationId" };
  }

  const tenantId = resolveTenantId(opp.locationId);
  if (!tenantId) {
    return { code: "unknown_tenant", detail: "locationId not present in GHL_LOCATION_TO_TENANT" };
  }

  if (!opp.id) {
    return { code: "rejected_validation", detail: "missing opportunity id" };
  }

  // Terminal non-job statuses are a correct no-op.
  if (opp.status === "lost" || opp.status === "abandoned") {
    return { code: "ignored_terminal_status", detail: opp.status };
  }

  const stageName = (opp.pipelineStage?.name ?? "").trim();

  // A stage that is present but not actionable ("New Lead") is a correct no-op.
  // A stage that is ABSENT is a workflow misconfiguration and must not be
  // reported back to GHL as a success — that is what hid this bug for weeks.
  if (!stageName) {
    return {
      code: "rejected_validation",
      detail: "missing pipelineStageName — stage routing cannot run",
    };
  }

  const stageNorm = stageName.toLowerCase();

  // ── CREATE: Diagnosis Booked or Estimate Approved ────────────────────────
  if (STAGES_THAT_CREATE_WORK_ORDER.some((s) => s.toLowerCase() === stageNorm)) {
    if (!opp.contact?.id) {
      return { code: "skipped_missing_contact", detail: `stage "${stageName}" requires contactId` };
    }

    const result = await createWorkOrderFromGHLStage(opp, stageName, tenantId);
    switch (result.outcome) {
      case "created":
        return { code: "created", detail: stageName, workOrderNumber: result.workOrder.wo_number };
      case "already_exists":
        return { code: "already_exists", detail: stageName, workOrderNumber: result.workOrder.wo_number };
      case "skipped":
        return { code: "skipped_missing_contact", detail: result.reason };
      case "error":
        // The factory returns rather than throws on failure. That is still a
        // failure and must not be recorded as a processed success.
        return { code: "failed_retryable", detail: result.reason };
    }
  }

  // ── UPDATE STATUS: Diagnosis Completed, In Progress, Completed/Won ───────
  const updateStatusValue = Object.entries(STAGES_THAT_UPDATE_STATUS).find(
    ([k]) => k.toLowerCase() === stageNorm,
  )?.[1];

  if (updateStatusValue) {
    const updated = await updateWorkOrderStatusByGHLOpportunity(
      opp.id, updateStatusValue, stageName, tenantId,
    );
    return updated
      ? { code: "status_updated", detail: stageName, workOrderNumber: updated }
      : { code: "ignored_no_matching_work_order", detail: stageName };
  }

  // Fallback: GHL top-level "won" without a matching stage → mark completed.
  if (opp.status === "won") {
    const updated = await updateWorkOrderStatusByGHLOpportunity(opp.id, "completed", "won", tenantId);
    return updated
      ? { code: "status_updated", detail: "won", workOrderNumber: updated }
      : { code: "ignored_no_matching_work_order", detail: "won" };
  }

  // ── FLAG ESTIMATE: Estimate Sent ─────────────────────────────────────────
  if (STAGES_THAT_FLAG_ESTIMATE.some((s) => s.toLowerCase() === stageNorm)) {
    const flagged = await flagEstimateFromGHL(opp.id, tenantId);
    return flagged
      ? { code: "estimate_flagged", detail: stageName, workOrderNumber: flagged }
      : { code: "ignored_no_matching_work_order", detail: stageName };
  }

  // A real stage that no rule targets.
  return { code: "ignored_non_action_stage", detail: stageName };
}

export async function dispatch(payload: GHLWebhookPayload): Promise<WebhookOutcome> {
  // Compared as a plain string rather than the narrowed union, so a runtime
  // mismatch from GHL body whitespace/encoding cannot be hidden by narrowing.
  const eventType = (payload.type as string | undefined)?.trim() ?? "";

  switch (eventType) {
    case "OpportunityStatusChange":
      return dispatchOpportunityStatusChange(payload as GHLOpportunityStatusChangePayload);

    case "ContactCreate":
    case "ContactUpdate": {
      const result = await upsertPropertyFromGHL(payload as GHLContactCreatePayload);
      switch (result.outcome) {
        case "created":
        case "updated":
          return { code: "status_updated", detail: `property ${result.outcome}` };
        case "skipped":
          return { code: "ignored_non_action_stage", detail: result.reason };
        case "error":
          return { code: "failed_retryable", detail: result.reason };
      }
      break;
    }

    case "AppointmentBooked": {
      const result = await createWorkOrderFromAppointment(payload as GHLAppointmentBookedPayload);
      switch (result.outcome) {
        case "created":
          return { code: "created", detail: "AppointmentBooked", workOrderNumber: result.workOrder.wo_number };
        case "already_exists":
          return { code: "already_exists", detail: "AppointmentBooked", workOrderNumber: result.workOrder.wo_number };
        case "skipped":
          return { code: "skipped_missing_contact", detail: result.reason };
        case "error":
          return { code: "failed_retryable", detail: result.reason };
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
      return { code: "ignored_event_type", detail: eventType };
  }

  return { code: "ignored_event_type", detail: eventType || "(empty)" };
}
