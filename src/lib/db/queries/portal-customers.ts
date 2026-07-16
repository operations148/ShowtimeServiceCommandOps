import { db } from "@/lib/db/client";
import type { PortalCustomer } from "@/types/portal";
import type { InvitePortalCustomerInput, UpdatePortalCustomerInput } from "@/lib/validation/portal";

// ─── Reads ─────────────────────────────────────────────────────────────────────

/**
 * All ACTIVE portal customers matching an email, ACROSS tenants. The login
 * flow doesn't know the tenant up front, so a magic link is issued per match;
 * each link is tenant-scoped via its portal_customer_id. Emails are compared
 * case-insensitively.
 */
export async function getActivePortalCustomersByEmail(email: string): Promise<PortalCustomer[]> {
  const { data, error } = await db
    .from("portal_customers")
    .select("*")
    .eq("is_active", true)
    .ilike("email", email);
  if (error) throw new Error(`[db] getActivePortalCustomersByEmail: ${error.message}`);
  return (data ?? []) as PortalCustomer[];
}

export async function getPortalCustomerById(id: string, tenantId: string): Promise<PortalCustomer | undefined> {
  const { data, error } = await db
    .from("portal_customers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getPortalCustomerById: ${error.message}`);
  return (data as PortalCustomer) ?? undefined;
}

export async function getPortalCustomerByEmailInTenant(email: string, tenantId: string): Promise<PortalCustomer | undefined> {
  const { data, error } = await db
    .from("portal_customers")
    .select("*")
    .eq("tenant_id", tenantId)
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new Error(`[db] getPortalCustomerByEmailInTenant: ${error.message}`);
  return (data as PortalCustomer) ?? undefined;
}

export async function listPortalCustomers(tenantId: string): Promise<Array<PortalCustomer & { property_ids: string[] }>> {
  const { data, error } = await db
    .from("portal_customers")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listPortalCustomers: ${error.message}`);
  const customers = (data ?? []) as PortalCustomer[];
  if (customers.length === 0) return [];

  const { data: links } = await db
    .from("portal_customer_properties")
    .select("portal_customer_id, property_id")
    .eq("tenant_id", tenantId);
  const byCustomer = new Map<string, string[]>();
  for (const l of (links ?? []) as { portal_customer_id: string; property_id: string }[]) {
    const arr = byCustomer.get(l.portal_customer_id) ?? [];
    arr.push(l.property_id);
    byCustomer.set(l.portal_customer_id, arr);
  }
  return customers.map((c) => ({ ...c, property_ids: byCustomer.get(c.id) ?? [] }));
}

export async function getPortalCustomerPropertyIds(portalCustomerId: string, tenantId: string): Promise<string[]> {
  const { data, error } = await db
    .from("portal_customer_properties")
    .select("property_id")
    .eq("portal_customer_id", portalCustomerId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`[db] getPortalCustomerPropertyIds: ${error.message}`);
  return ((data ?? []) as { property_id: string }[]).map((r) => r.property_id);
}

// ─── Writes ────────────────────────────────────────────────────────────────────

export type InvitePortalCustomerResult =
  | { ok: true; customer: PortalCustomer; created: boolean }
  | { ok: false; reason: "invalid_property" };

/**
 * Creates a portal customer (or re-grants an existing one), verifying every
 * requested property belongs to the tenant, then setting the exact property
 * grant set. Idempotent on (tenant_id, email).
 */
export async function invitePortalCustomer(
  input: InvitePortalCustomerInput,
  tenantId: string,
  invitedBy: string,
): Promise<InvitePortalCustomerResult> {
  // Verify all properties belong to the tenant.
  const { data: props } = await db
    .from("properties")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", input.property_ids);
  const validIds = new Set(((props ?? []) as { id: string }[]).map((p) => p.id));
  if (validIds.size !== input.property_ids.length) return { ok: false, reason: "invalid_property" };

  const existing = await getPortalCustomerByEmailInTenant(input.email, tenantId);
  let customer: PortalCustomer;
  let created: boolean;

  if (existing) {
    const { data, error } = await db
      .from("portal_customers")
      .update({ name: input.name, phone: input.phone ?? null, is_active: true })
      .eq("id", existing.id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    if (error) throw new Error(`[db] invitePortalCustomer update: ${error.message}`);
    customer = data as PortalCustomer;
    created = false;
  } else {
    const { data, error } = await db
      .from("portal_customers")
      .insert({ tenant_id: tenantId, email: input.email, name: input.name, phone: input.phone ?? null, invited_by: invitedBy })
      .select("*")
      .single();
    if (error) throw new Error(`[db] invitePortalCustomer insert: ${error.message}`);
    customer = data as PortalCustomer;
    created = true;
  }

  await setPortalCustomerProperties(customer.id, tenantId, input.property_ids);
  return { ok: true, customer, created };
}

export async function setPortalCustomerProperties(portalCustomerId: string, tenantId: string, propertyIds: string[]): Promise<void> {
  await db.from("portal_customer_properties").delete().eq("portal_customer_id", portalCustomerId).eq("tenant_id", tenantId);
  if (propertyIds.length > 0) {
    const rows = propertyIds.map((pid) => ({ portal_customer_id: portalCustomerId, property_id: pid, tenant_id: tenantId }));
    const { error } = await db.from("portal_customer_properties").insert(rows);
    if (error) throw new Error(`[db] setPortalCustomerProperties: ${error.message}`);
  }
}

export type UpdatePortalCustomerResult =
  | { ok: true; customer: PortalCustomer }
  | { ok: false; notFound: true }
  | { ok: false; invalidProperty: true };

export async function updatePortalCustomer(
  id: string,
  patch: UpdatePortalCustomerInput,
  tenantId: string,
): Promise<UpdatePortalCustomerResult> {
  const existing = await getPortalCustomerById(id, tenantId);
  if (!existing) return { ok: false, notFound: true };

  if (patch.property_ids !== undefined) {
    const { data: props } = await db.from("properties").select("id").eq("tenant_id", tenantId).in("id", patch.property_ids.length ? patch.property_ids : ["00000000-0000-0000-0000-000000000000"]);
    const validIds = new Set(((props ?? []) as { id: string }[]).map((p) => p.id));
    if (patch.property_ids.length > 0 && validIds.size !== patch.property_ids.length) return { ok: false, invalidProperty: true };
  }

  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.phone !== undefined) payload.phone = patch.phone ?? null;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  let customer = existing;
  if (Object.keys(payload).length > 0) {
    const { data, error } = await db.from("portal_customers").update(payload).eq("id", id).eq("tenant_id", tenantId).select("*").single();
    if (error) throw new Error(`[db] updatePortalCustomer: ${error.message}`);
    customer = data as PortalCustomer;
  }
  if (patch.property_ids !== undefined) {
    await setPortalCustomerProperties(id, tenantId, patch.property_ids);
  }
  return { ok: true, customer };
}

export async function touchPortalCustomerLogin(id: string, tenantId: string): Promise<void> {
  await db.from("portal_customers").update({ last_login_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", tenantId);
}

// ─── Sessions (admin review) ────────────────────────────────────────────────

export async function listPortalSessions(portalCustomerId: string, tenantId: string) {
  const { data, error } = await db
    .from("portal_sessions")
    .select("id, issued_at, last_seen_at, expires_at, revoked_at, ip, user_agent")
    .eq("portal_customer_id", portalCustomerId)
    .eq("tenant_id", tenantId)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(`[db] listPortalSessions: ${error.message}`);
  return data ?? [];
}

export async function listPortalEvents(portalCustomerId: string, tenantId: string, limit = 50) {
  const { data, error } = await db
    .from("portal_events")
    .select("*")
    .eq("portal_customer_id", portalCustomerId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[db] listPortalEvents: ${error.message}`);
  return data ?? [];
}
