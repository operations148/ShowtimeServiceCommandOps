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
import { findByGhlOpportunityId, createWorkOrderFull } from "@/lib/mock-data/store";
import { findPropertyByGhlContactId } from "@/lib/mock-data/property-store";
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

export function createWorkOrderFromGHL(
  payload: GHLOpportunityStatusChangePayload
): CreateWorkOrderFromGHLResult {
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
    console.log(
      `${tag} Stage "${stageName ?? "(none)"}" / status "${payload.status ?? "(none)"}" did not pass job-ready gate. Discarding.`
    );
    return {
      outcome: "skipped",
      reason: `Stage "${stageName}" is not job-ready`,
    };
  }

  // ── 4. Property lookup ─────────────────────────────────────────────────────
  const property = findPropertyByGhlContactId(contactId, tenantId);
  if (!property) {
    // Contact webhook may not have arrived yet — in production, queue for retry.
    console.warn(
      `${tag} No Property found for ghl_contact_id="${contactId}" tenant="${tenantId}". ` +
      `Contact webhook may still be in flight. Discarding (queue retry in production).`
    );
    return { outcome: "skipped", reason: `No property for ghl_contact_id: ${contactId}` };
  }

  // ── 5. Idempotency check ───────────────────────────────────────────────────
  const existing = findByGhlOpportunityId(payload.id, tenantId);
  if (existing) {
    console.log(
      `${tag} WorkOrder "${existing.id}" already exists for this opportunity. Skipping create.`
    );
    return { outcome: "already_exists", workOrder: existing };
  }

  // ── 6. Map fields ──────────────────────────────────────────────────────────

  // Title — trim, max 200 chars, fall back to a generated label
  const rawTitle = payload.name?.trim().slice(0, 200);
  const title = rawTitle || `GHL Job — ${property.customer_name}`;

  // Description — preserve as-is; do not truncate (tech notes live here later)
  const description = payload.notes?.trim().slice(0, 5000) || undefined;

  // Status
  const status = mapGhlStatus(payload.status, stageName);

  // Service category — custom field takes precedence over stage name
  const cfServiceCat = extractOppCustomField(payload.customFields, "GHL_CF_OPP_SERVICE_CAT");
  const serviceCategory =
    mapServiceCategoryFromCustomField(cfServiceCat) ??
    mapServiceCategoryFromStageName(stageName);

  if (serviceCategory === undefined) {
    // mapServiceCategoryFromStageName always returns a value so this branch is unreachable,
    // but TypeScript guard for safety.
    console.warn(`${tag} Could not resolve service category; defaulting to OTHER.`);
  }

  // Scheduled date and time
  const rawDate  = extractOppCustomField(payload.customFields, "GHL_CF_OPP_SCHEDULED_DATE");
  const rawStart = extractOppCustomField(payload.customFields, "GHL_CF_OPP_TIME_START");
  const rawEnd   = extractOppCustomField(payload.customFields, "GHL_CF_OPP_TIME_END");

  const scheduledDate      = parseGhlDate(rawDate);
  const scheduledTimeStart = parseGhlTime(rawStart);
  const scheduledTimeEnd   = parseGhlTime(rawEnd);

  if (rawDate && !scheduledDate) {
    console.warn(`${tag} Scheduled date "${rawDate}" failed format check (expected YYYY-MM-DD). Field omitted.`);
  }
  if (rawStart && !scheduledTimeStart) {
    console.warn(`${tag} Start time "${rawStart}" failed format check (expected HH:MM). Field omitted.`);
  }
  if (rawEnd && !scheduledTimeEnd) {
    console.warn(`${tag} End time "${rawEnd}" failed format check (expected HH:MM). Field omitted.`);
  }

  // Priority
  const rawPriority = extractOppCustomField(payload.customFields, "GHL_CF_OPP_PRIORITY");
  const priority = mapGhlPriority(rawPriority);

  // Technician
  const techId = resolveGhlUserToTechId(payload.assignedTo);
  if (payload.assignedTo && !techId) {
    console.warn(
      `${tag} GHL user "${payload.assignedTo}" not in GHL_USER_TO_TECHNICIAN map. ` +
      `assigned_technician_id will be undefined.`
    );
  }

  // completed_at — only set when mapping to COMPLETED
  const completedAt = status === WorkOrderStatus.COMPLETED ? new Date().toISOString() : undefined;

  // ── 7. Create ──────────────────────────────────────────────────────────────
  const propertyAddress = [
    property.address_line1,
    property.address_line2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(", ");

  const workOrder = createWorkOrderFull(
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
