// Orchestrates WorkOrder creation from a GHL AppointmentBooked payload.
//
// Processing order:
//   1. Resolve tenant_id from locationId
//   2. Validate required fields (appointmentInfo.id + contact.id)
//   3. Look up Property by ghl_contact_id — skip if not found
//   4. Idempotency — skip if a WorkOrder already exists for this appointment id
//   5. Map fields from appointmentInfo
//   6. Create WorkOrder (status = NEW)
//
// Never throws. Returns a typed result so the caller can log and continue.

import type { GHLAppointmentBookedPayload } from "@/types/ghl";
import type { WorkOrderWithRelations } from "@/types/work-order";
import { WorkOrderStatus, Priority, ServiceCategory } from "@/types/work-order";
import { findByGhlOpportunityId, createWorkOrderFull } from "@/lib/db/queries/work-orders";
import { findPropertyByGhlContactId } from "@/lib/db/queries/properties";
import { resolveTenantId, resolveGhlUserToTechId } from "./tenant-config";

// ─── Result type ──────────────────────────────────────────────────────────────

export type CreateWorkOrderFromAppointmentResult =
  | { outcome: "created";       workOrder: WorkOrderWithRelations }
  | { outcome: "already_exists"; workOrder: WorkOrderWithRelations }
  | { outcome: "skipped";       reason: string }
  | { outcome: "error";         reason: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD from an ISO datetime string, e.g. "2024-01-15T09:00:00Z" → "2024-01-15" */
function parseIsoDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : undefined;
}

/** Extract HH:MM from an ISO datetime string, e.g. "2024-01-15T09:00:00Z" → "09:00" */
function parseIsoTime(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const match = iso.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : undefined;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function createWorkOrderFromAppointment(
  payload: GHLAppointmentBookedPayload
): Promise<CreateWorkOrderFromAppointmentResult> {
  const apptId = payload.appointmentInfo?.id;
  const tag = `[ghl/appointment id=${apptId ?? "unknown"}]`;

  // ── 1. Resolve tenant ──────────────────────────────────────────────────────
  const tenantId = resolveTenantId(payload.locationId);
  if (!tenantId) {
    console.error(
      `${tag} Unknown locationId "${payload.locationId}" — not in GHL_LOCATION_TO_TENANT map. Discarding.`
    );
    return { outcome: "skipped", reason: `Unknown locationId: ${payload.locationId}` };
  }

  // ── 2. Validate required fields ────────────────────────────────────────────
  if (!apptId) {
    console.error(`${tag} Missing appointmentInfo.id. Discarding.`);
    return { outcome: "error", reason: "Missing appointmentInfo.id in payload" };
  }

  const contactId = payload.contact?.id;
  if (!contactId) {
    console.warn(`${tag} Missing contact.id — cannot resolve property. Discarding.`);
    return { outcome: "skipped", reason: "Missing contact.id" };
  }

  // ── 3. Property lookup ─────────────────────────────────────────────────────
  const property = await findPropertyByGhlContactId(contactId, tenantId);
  if (!property) {
    console.warn(
      `${tag} No Property found for ghl_contact_id="${contactId}" tenant="${tenantId}". ` +
      `ContactCreate webhook may still be in flight. Discarding (queue retry in production).`
    );
    return { outcome: "skipped", reason: `No property for ghl_contact_id: ${contactId}` };
  }

  // ── 4. Idempotency — use appointment id as the ghl_opportunity_id key ─────
  const existing = await findByGhlOpportunityId(apptId, tenantId);
  if (existing) {
    return { outcome: "already_exists", workOrder: existing };
  }

  // ── 5. Map fields ──────────────────────────────────────────────────────────
  const apptInfo = payload.appointmentInfo;

  const rawTitle = apptInfo?.title?.trim().slice(0, 200);
  const title = rawTitle || `Appointment — ${property.customer_name}`;
  const description = apptInfo?.notes?.trim().slice(0, 5000) || undefined;

  const scheduledDate      = parseIsoDate(apptInfo?.startTime);
  const scheduledTimeStart = parseIsoTime(apptInfo?.startTime);
  const scheduledTimeEnd   = parseIsoTime(apptInfo?.endTime);

  const techId = resolveGhlUserToTechId(apptInfo?.assignedUserId);

  const propertyAddress = [
    property.address_line1,
    property.address_line2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(", ");

  // ── 6. Create ──────────────────────────────────────────────────────────────
  const workOrder = await createWorkOrderFull(
    {
      tenant_id:              tenantId,
      property_id:            property.id,
      ghl_contact_id:         contactId,
      ghl_opportunity_id:     apptId,
      title,
      description,
      status:                 WorkOrderStatus.NEW,
      priority:               Priority.NORMAL,
      service_category:       ServiceCategory.OTHER,
      assigned_technician_id: techId,
      scheduled_date:         scheduledDate,
      scheduled_time_start:   scheduledTimeStart,
      scheduled_time_end:     scheduledTimeEnd,
    },
    propertyAddress,
    property.customer_name,
  );

  console.log(
    `${tag} Created WorkOrder "${workOrder.id}" (${workOrder.wo_number}) ` +
    `status="${workOrder.status}" tenant="${tenantId}"`
  );

  return { outcome: "created", workOrder };
}
