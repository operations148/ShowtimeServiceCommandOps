import { db } from "@/lib/db/client";
import type { PortalBranding, PortalPropertySummary } from "@/types/portal";

/**
 * Property-scoped reads for the customer portal (Phase 7). EVERY query is
 * filtered to the caller's authorized `propertyIds` — a portal customer can
 * never see another customer's property, estimate, change order, invoice, or
 * work history. List endpoints return lightweight safe summaries; detail
 * endpoints go through the existing redacted public serializers (with an
 * access check) so internal fields structurally cannot leak.
 *
 * Empty propertyIds → every query returns [] (a customer linked to no
 * properties sees nothing), never an unscoped query.
 */

const NONE = ["00000000-0000-0000-0000-000000000000"];
function scope(ids: string[]): string[] {
  return ids.length > 0 ? ids : NONE;
}

// ─── Branding ──────────────────────────────────────────────────────────────────

export async function getPortalBranding(tenantId: string): Promise<PortalBranding> {
  const { data } = await db
    .from("tenants")
    .select("name, logo_url, business_phone, business_email, portal_booking_url")
    .eq("id", tenantId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    company_name: (row.name as string) ?? "ServiceOps",
    company_logo_url: (row.logo_url as string | null) ?? null,
    company_phone: (row.business_phone as string | null) ?? null,
    company_email: (row.business_email as string | null) ?? null,
    booking_url: (row.portal_booking_url as string | null) ?? null,
  };
}

// ─── Properties ────────────────────────────────────────────────────────────────

export async function listPortalProperties(tenantId: string, propertyIds: string[]): Promise<PortalPropertySummary[]> {
  const { data, error } = await db
    .from("properties")
    .select("id, customer_name, address_line1, address_line2, city, state, zip")
    .eq("tenant_id", tenantId)
    .in("id", scope(propertyIds));
  if (error) throw new Error(`[db] listPortalProperties: ${error.message}`);
  return ((data ?? []) as Record<string, string | null>[]).map((p) => ({
    id: p.id as string,
    customer_name: (p.customer_name as string) ?? "",
    address: [p.address_line1, p.address_line2, [p.city, p.state].filter(Boolean).join(", "), p.zip].filter(Boolean).join(", "),
  }));
}

// ─── Estimate summaries (property-scoped) ────────────────────────────────────

export interface PortalDocSummary {
  id: string;
  number: string;
  title: string;
  status: string;
  amount: number; // cents
  date: string;
  property_id: string | null;
}

export async function listPortalEstimates(tenantId: string, propertyIds: string[]): Promise<PortalDocSummary[]> {
  const { data, error } = await db
    .from("estimates")
    .select("id, estimate_number, title, status, total, issue_date, property_id")
    .eq("tenant_id", tenantId)
    .in("property_id", scope(propertyIds))
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listPortalEstimates: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    number: r.estimate_number as string,
    title: r.title as string,
    status: r.status as string,
    amount: (r.total as number) ?? 0,
    date: (r.issue_date as string) ?? "",
    property_id: (r.property_id as string | null) ?? null,
  }));
}

// ─── Invoice summaries (property-scoped) ─────────────────────────────────────

export interface PortalInvoiceSummary extends PortalDocSummary {
  amount_due: number;
}

export async function listPortalInvoices(tenantId: string, propertyIds: string[]): Promise<PortalInvoiceSummary[]> {
  const { data, error } = await db
    .from("invoices")
    .select("id, invoice_number, title, status, total, amount_due, issue_date, property_id")
    .eq("tenant_id", tenantId)
    .in("property_id", scope(propertyIds))
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listPortalInvoices: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    number: r.invoice_number as string,
    title: r.title as string,
    status: r.status as string,
    amount: (r.total as number) ?? 0,
    amount_due: (r.amount_due as number) ?? 0,
    date: (r.issue_date as string) ?? "",
    property_id: (r.property_id as string | null) ?? null,
  }));
}

// ─── Work-order (work history) summaries ─────────────────────────────────────

export interface PortalWorkOrderSummary {
  id: string;
  wo_number: string;
  title: string;
  status: string;
  service_category: string;
  scheduled_date: string | null;
  completed_at: string | null;
  property_id: string;
}

export async function listPortalWorkOrders(tenantId: string, propertyIds: string[]): Promise<PortalWorkOrderSummary[]> {
  const { data, error } = await db
    .from("work_orders")
    .select("id, wo_number, title, status, service_category, scheduled_date, completed_at, property_id")
    .eq("tenant_id", tenantId)
    .in("property_id", scope(propertyIds))
    .order("scheduled_date", { ascending: false });
  if (error) throw new Error(`[db] listPortalWorkOrders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    wo_number: String(r.wo_number ?? ""),
    title: r.title as string,
    status: r.status as string,
    service_category: r.service_category as string,
    scheduled_date: (r.scheduled_date as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    property_id: r.property_id as string,
  }));
}

// ─── Change-order summaries (property via work order) ────────────────────────

export interface PortalChangeOrderSummary extends PortalDocSummary {
  work_order_id: string;
}

/**
 * Change orders don't carry property_id — they link to a work order. Resolve
 * the caller's work orders first, then their change orders. Both steps are
 * property-scoped, so a change order on an unauthorized work order is invisible.
 */
export async function listPortalChangeOrders(tenantId: string, propertyIds: string[]): Promise<PortalChangeOrderSummary[]> {
  const wos = await listPortalWorkOrders(tenantId, propertyIds);
  const woIds = wos.map((w) => w.id);
  if (woIds.length === 0) return [];

  const { data, error } = await db
    .from("change_orders")
    .select("id, change_order_number, reason, status, total_impact_cents, created_at, work_order_id")
    .eq("tenant_id", tenantId)
    .in("work_order_id", woIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listPortalChangeOrders: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    number: r.change_order_number as string,
    title: r.reason as string,
    status: r.status as string,
    amount: (r.total_impact_cents as number) ?? 0,
    date: (r.created_at as string) ?? "",
    property_id: null,
    work_order_id: r.work_order_id as string,
  }));
}

/** Returns the property_id a change order belongs to (via its work order), or null. */
export async function getChangeOrderPropertyId(changeOrderId: string, tenantId: string): Promise<string | null> {
  const { data: co } = await db
    .from("change_orders")
    .select("work_order_id")
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const woId = (co as { work_order_id?: string } | null)?.work_order_id;
  if (!woId) return null;
  const { data: wo } = await db.from("work_orders").select("property_id").eq("id", woId).eq("tenant_id", tenantId).maybeSingle();
  return (wo as { property_id?: string } | null)?.property_id ?? null;
}
