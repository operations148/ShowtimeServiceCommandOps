import { db } from "@/lib/db/client";

/**
 * Cross-tenant platform-admin queries (Phase 10).
 *
 * DANGER SURFACE: these functions DELIBERATELY do not scope by tenant_id —
 * that's the whole point of platform admin. They must ONLY be reached from
 * routes that have already checked BOTH canManageTenants (platform_owner) AND
 * the platform-admin kill-switch. Never import these into a tenant-scoped path.
 *
 * They return AGGREGATE operational metadata only — never customer PII. A
 * platform owner can see that a tenant exists, is active, and how much work it
 * has; they cannot read that tenant's customers, invoices, or job details
 * through this surface. Cross-tenant data access is a separate, unbuilt concern.
 */

export interface TenantAdminSummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  counts: {
    users: number;
    technicians: number;
    work_orders: number;
    open_invoices: number;
  };
}

const OPEN_INVOICE_STATUSES = ["sent", "viewed", "deposit_due", "deposit_paid", "partially_paid", "overdue"];

export async function listAllTenants(): Promise<TenantAdminSummary[]> {
  const { data: tenants, error } = await db
    .from("tenants")
    .select("id, name, slug, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[db] listAllTenants: ${error.message}`);

  const rows = (tenants ?? []) as Omit<TenantAdminSummary, "counts">[];
  if (rows.length === 0) return [];

  // Per-tenant aggregate counts. head:true + count:"exact" returns only the
  // count, never the rows — so no PII crosses the tenant boundary here.
  const summaries = await Promise.all(
    rows.map(async (t) => {
      const [users, techs, wos, openInv] = await Promise.all([
        db.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
        db.from("technicians").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
        db.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
        db.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).in("status", OPEN_INVOICE_STATUSES),
      ]);
      return {
        ...t,
        counts: {
          users: users.count ?? 0,
          technicians: techs.count ?? 0,
          work_orders: wos.count ?? 0,
          open_invoices: openInv.count ?? 0,
        },
      };
    })
  );

  return summaries;
}

export async function setTenantActive(
  tenantId: string, isActive: boolean
): Promise<{ id: string; name: string; is_active: boolean } | undefined> {
  const { data, error } = await db
    .from("tenants")
    .update({ is_active: isActive })
    .eq("id", tenantId)
    .select("id, name, is_active")
    .maybeSingle();
  if (error) throw new Error(`[db] setTenantActive: ${error.message}`);
  return (data as { id: string; name: string; is_active: boolean } | null) ?? undefined;
}
