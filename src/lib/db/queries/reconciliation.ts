import { db } from "@/lib/db/client";
import type { ReconciliationFinding, ReconciliationRun } from "@/types/invoice";

export async function listReconciliationFindings(
  tenantId: string,
  opts: { status?: "open" | "resolved" | "ignored" } = {},
): Promise<ReconciliationFinding[]> {
  let q = db
    .from("reconciliation_findings")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`[db] listReconciliationFindings: ${error.message}`);
  return (data ?? []) as ReconciliationFinding[];
}

export async function getReconciliationFinding(
  id: string,
  tenantId: string,
): Promise<ReconciliationFinding | undefined> {
  const { data, error } = await db
    .from("reconciliation_findings")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getReconciliationFinding: ${error.message}`);
  return (data as ReconciliationFinding) ?? undefined;
}

export type ResolveFindingResult =
  | { ok: true; data: ReconciliationFinding }
  | { ok: false; notFound: true };

export async function resolveReconciliationFinding(
  id: string,
  tenantId: string,
  userId: string,
  status: "resolved" | "ignored",
  reason: string,
): Promise<ResolveFindingResult> {
  const { data, error } = await db
    .from("reconciliation_findings")
    .update({
      status,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
      resolution_reason: reason,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] resolveReconciliationFinding: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: data as ReconciliationFinding };
}

export async function listReconciliationRuns(limit = 20): Promise<ReconciliationRun[]> {
  const { data, error } = await db
    .from("reconciliation_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[db] listReconciliationRuns: ${error.message}`);
  return (data ?? []) as ReconciliationRun[];
}
