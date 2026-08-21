// ⚠️  DEAD MODULE — NOT ON THE ACTIVE INBOUND PATH. DO NOT EXTEND.
//
// `createWorkOrderFromGHL` has ZERO importers anywhere in src/ (verified by
// call-graph trace). The live OpportunityStatusChange path is:
//   src/app/api/ghl/webhooks/route.ts
//     -> src/lib/ghl/dispatch.ts
//       -> src/lib/ghl/work-order-factory.ts :: createWorkOrderFromGHLStage
//
// The two differ in a way that matters, which is why confusing them is
// dangerous:
//   * This module gates on isJobReadyStage() — loose SUBSTRING matching driven
//     by GHL_JOB_READY_STAGES. That env var therefore has no effect on real
//     inbound traffic, despite being set in production.
//   * The live factory matches EXACT stage names from
//     src/lib/constants/ghl-pipeline.ts and enforces per-(opportunity, stage)
//     idempotency.
//
// Kept rather than deleted: removal is a separate, independently reviewable
// change, and this incident's repair deliberately stayed minimal. If you are
// debugging why a stage did or did not create a work order, this file is not
// the code that ran.
//
// Orchestrates WorkOrder creation from a GHL OpportunityStatusChange payload.
//
// Processing order (mirrors ghl-opportunity-mapping.md § Upsert Logic):
//   1. Resolve tenant_id from locationId
//   2. Validate required fields are present
//   3. Stage gate — discard lead/quote stages
//   4. Look up Property by ghl_contact_id — skip if not found (contact may not have synced yet)
//   5. Idempotency — skip if a WorkOrder already exists for this ghl_opportunity_id
//   6. Map all fields
//   7. Create WorkOrder
//
// Never throws. Returns a typed result so the caller can log and continue.

import type { GHLOpportunityStatusChangePayload } from "@/types/ghl";
import type { WorkOrderWithRelations } from "@/types/work-order";
import { WorkOrderStatus } from "@/types/work-order";
import { findByGhlOpportunityId, createWorkOrderFull } from "@/lib/db/queries/work-orders";
import { findPropertyByGhlContactId } from "@/lib/db/queries/properties";
import { resolveTenantId, resolveGhlUserToTechId } from "./tenant-config";
import {
  mapGhlStatus,
  mapServiceCategoryFromStageName,
  mapServiceCategoryFromCustomField,
  extractOppCustomField,
  parseGhlDate,
  parseGhlTime,
  mapGhlPriority,
  isJobReadyStage,
} from "./map-opportunity";

// ─── Result type ──────────────────────────────────────────────────────────────

export type CreateWorkOrderFromGHLResult =
  | { outcome: "created";       workOrder: WorkOrderWithRelations }
  | { outcome: "already_exists"; workOrder: WorkOrderWithRelations }
  | { outcome: "skipped";       reason: string }
  | { outcome: "error";         reason: string };

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function createWorkOrderFromGHL(
  payload: GHLOpportunityStatusChangePayload
): Promise<CreateWorkOrderFromGHLResult> {
  const tag = `[ghl/opportunity id=${payload.id}]`;

  // ── 1. Resolve tenant ──────────────────────────────────────────────────────
  const tenantId = resolveTenantId(payload.locationId);
  if (!tenantId) {
    console.error(
      `${tag} Unknown locationId "${payload.locationId}" — not in GHL_LOCATION_TO_TENANT map. Discarding.`
    );
    return { outcome: "skipped", reason: `Unknown locationId: ${payload.locationId}` };
  }

  // ── 2. Validate required fields ────────────────────────────────────────────
  if (!payload.id) {
    console.error(`${tag} Missing opportunity id. Discarding.`);
    return { outcome: "error", reason: "Missing opportunity id in payload" };
  }

  const contactId = payload.contact?.id;
  if (!contactId) {
    console.warn(`${tag} Missing contact.id — cannot resolve property. Discarding.`);
    return { outcome: "skipped", reason: "Missing contact.id" };
  }

  // ── 3. Stage gate ──────────────────────────────────────────────────────────
  const stageName = payload.pipelineStage?.name;
  if (!isJobReadyStage(stageName, payload.status)) {
    return {
      outcome: "skipped",
      reason: `Stage "${stageName}" is not job-ready`,
    };
  }

  // ── 4. Property lookup ─────────────────────────────────────────────────────
  const property = await findPropertyByGhlContactId(contactId, tenantId);
  if (!property) {
    console.warn(
      `${tag} No Property found for ghl_contact_id="${contactId}" tenant="${tenantId}". ` +
      `Contact webhook may still be in flight. Discarding (queue retry in production).`
    );
    return { outcome: "skipped", reason: `No property for ghl_contact_id: ${contactId}` };
  }

  // ── 5. Idempotency check ───────────────────────────────────────────────────
  const existing = await findByGhlOpportunityId(payload.id, tenantId);
  if (existing) {
    return { outcome: "already_exists", workOrder: existing };
  }

  // ── 6. Map fields ──────────────────────────────────────────────────────────

  const rawTitle = payload.name?.trim().slice(0, 200);
  const title = rawTitle || `GHL Job — ${property.customer_name}`;
  const description = payload.notes?.trim().slice(0, 5000) || undefined;

  const status = mapGhlStatus(payload.status, stageName);

  const cfServiceCat = extractOppCustomField(payload.customFields, "GHL_CF_OPP_SERVICE_CAT");
  const serviceCategory =
    mapServiceCategoryFromCustomField(cfServiceCat) ??
    mapServiceCategoryFromStageName(stageName);

  const rawDate  = extractOppCustomField(payload.customFields, "GHL_CF_OPP_SCHEDULED_DATE");
  const rawStart = extractOppCustomField(payload.customFields, "GHL_CF_OPP_TIME_START");
  const rawEnd   = extractOppCustomField(payload.customFields, "GHL_CF_OPP_TIME_END");

  const scheduledDate      = parseGhlDate(rawDate);
  const scheduledTimeStart = parseGhlTime(rawStart);
  const scheduledTimeEnd   = parseGhlTime(rawEnd);

  const rawPriority = extractOppCustomField(payload.customFields, "GHL_CF_OPP_PRIORITY");
  const priority = mapGhlPriority(rawPriority);

  const techId = resolveGhlUserToTechId(payload.assignedTo);

  const completedAt = status === WorkOrderStatus.COMPLETED ? new Date().toISOString() : undefined;

  // ── 7. Create ──────────────────────────────────────────────────────────────
  const propertyAddress = [
    property.address_line1,
    property.address_line2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(", ");

  const workOrder = await createWorkOrderFull(
    {
      tenant_id:              tenantId,
      property_id:            property.id,
      ghl_contact_id:         contactId,
      ghl_opportunity_id:     payload.id,
      title,
      description,
      status,
      priority,
      service_category:       serviceCategory,
      assigned_technician_id: techId,
      scheduled_date:         scheduledDate,
      scheduled_time_start:   scheduledTimeStart,
      scheduled_time_end:     scheduledTimeEnd,
      completed_at:           completedAt,
    },
    propertyAddress,
    property.customer_name,
  );

  console.log(
    `${tag} Created WorkOrder "${workOrder.id}" (${workOrder.wo_number}) ` +
    `status="${workOrder.status}" category="${workOrder.service_category}" ` +
    `tenant="${tenantId}"`
  );

  return { outcome: "created", workOrder };
}
