// Orchestrates Property create-or-update from a GHL ContactCreate/ContactUpdate payload.
//
// Processing order:
//   1. Resolve tenant_id from locationId
//   2. Validate required fields (id must be present)
//   3. Look up existing Property by ghl_contact_id
//   4. If found — patch name and address fields that are non-empty in the payload
//   5. If not found — create a new Property (requires at least address_line1)
//
// Never throws. Returns a typed result so the caller can log and continue.

import type { GHLContactCreatePayload, GHLContactUpdatePayload } from "@/types/ghl";
import type { PropertyWithRelations } from "@/types/property";
import { findPropertyByGhlContactId, createProperty, updateProperty } from "@/lib/db/queries/properties";
import { resolveTenantId } from "./tenant-config";

// ─── Result type ──────────────────────────────────────────────────────────────

export type UpsertPropertyFromGHLResult =
  | { outcome: "created";  property: PropertyWithRelations }
  | { outcome: "updated";  property: PropertyWithRelations }
  | { outcome: "skipped";  reason: string }
  | { outcome: "error";    reason: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCustomerName(payload: GHLContactCreatePayload | GHLContactUpdatePayload): string {
  if (payload.name?.trim()) return payload.name.trim().slice(0, 120);
  const parts = [payload.firstName?.trim(), payload.lastName?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(" ").slice(0, 120);
  return "Unknown Contact";
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function upsertPropertyFromGHL(
  payload: GHLContactCreatePayload | GHLContactUpdatePayload
): Promise<UpsertPropertyFromGHLResult> {
  const tag = `[ghl/contact id=${payload.id}]`;

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
    console.error(`${tag} Missing contact id. Discarding.`);
    return { outcome: "error", reason: "Missing contact id in payload" };
  }

  // ── 3. Look up existing property ──────────────────────────────────────────
  const existing = await findPropertyByGhlContactId(payload.id, tenantId);

  const customerName = buildCustomerName(payload);

  if (existing) {
    // ── 4. Update — patch non-empty fields ──────────────────────────────────
    const patch: Record<string, string> = {};
    if (customerName !== "Unknown Contact") patch.customer_name = customerName;
    if (payload.address1?.trim()) patch.address_line1 = payload.address1.trim().slice(0, 200);
    if (payload.city?.trim())     patch.city           = payload.city.trim().slice(0, 100);
    if (payload.state?.trim())    patch.state          = payload.state.trim().slice(0, 2).toUpperCase();
    if (payload.postalCode?.trim()) patch.zip          = payload.postalCode.trim();

    if (Object.keys(patch).length === 0) {
      return { outcome: "skipped", reason: "No patchable fields in payload" };
    }

    const result = await updateProperty(existing.id, patch, tenantId);
    if (!result.ok) {
      console.error(`${tag} updateProperty returned notFound for id="${existing.id}"`);
      return { outcome: "error", reason: "Property disappeared between lookup and update" };
    }

    console.log(`${tag} Updated Property "${result.data.id}" (${result.data.customer_name}) tenant="${tenantId}"`);
    return { outcome: "updated", property: result.data };
  }

  // ── 5. Create — requires at least address_line1 ───────────────────────────
  const address1 = payload.address1?.trim();
  if (!address1) {
    console.warn(
      `${tag} No existing Property found and payload has no address_line1 — cannot create. Skipping.`
    );
    return { outcome: "skipped", reason: "Missing address_line1 — property not created" };
  }

  const city  = payload.city?.trim() || "Unknown";
  const state = (payload.state?.trim() || "XX").slice(0, 2).toUpperCase();
  const zip   = payload.postalCode?.trim() || "00000";

  const property = await createProperty(
    {
      ghl_contact_id: payload.id,
      customer_name:  customerName,
      address_line1:  address1.slice(0, 200),
      city:           city.slice(0, 100),
      state,
      zip,
      is_active:      true,
    },
    tenantId
  );

  console.log(`${tag} Created Property "${property.id}" (${property.customer_name}) tenant="${tenantId}"`);
  return { outcome: "created", property };
}
