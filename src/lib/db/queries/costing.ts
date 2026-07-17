import { db } from "@/lib/db/client";
import type { TimeEntry, MileageEntry, JobExpense, JobCostSummary } from "@/types/costing";
import {
  computeLaborCost, computeMileageCost, computeBillableAmount,
  minutesBetween, resolveHourlyCostCents, summarizeJobCost, type CostEntries,
} from "@/lib/costing/costing";
import type {
  CreateTimeEntryInput, UpdateTimeEntryInput,
  CreateMileageEntryInput, UpdateMileageEntryInput,
  CreateJobExpenseInput, UpdateJobExpenseInput,
} from "@/lib/validation/costing";

// ─── Rate resolution (server-held; never client-supplied) ────────────────────

async function getTenantRates(tenantId: string): Promise<{ mileage: number; labor: number }> {
  const { data } = await db
    .from("tenants")
    .select("default_mileage_rate_cents, default_labor_cost_cents")
    .eq("id", tenantId)
    .maybeSingle();
  const row = (data ?? {}) as { default_mileage_rate_cents?: number; default_labor_cost_cents?: number };
  return { mileage: row.default_mileage_rate_cents ?? 0, labor: row.default_labor_cost_cents ?? 0 };
}

async function getTechnicianRate(technicianId: string, tenantId: string): Promise<number | null> {
  const { data } = await db
    .from("technicians")
    .select("hourly_cost_cents")
    .eq("id", technicianId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as { hourly_cost_cents?: number } | null)?.hourly_cost_cents ?? null;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listTimeEntries(workOrderId: string, tenantId: string): Promise<TimeEntry[]> {
  const { data, error } = await db
    .from("time_entries").select("*")
    .eq("work_order_id", workOrderId).eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listTimeEntries: ${error.message}`);
  return (data ?? []) as TimeEntry[];
}

export async function listMileageEntries(workOrderId: string, tenantId: string): Promise<MileageEntry[]> {
  const { data, error } = await db
    .from("mileage_entries").select("*")
    .eq("work_order_id", workOrderId).eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listMileageEntries: ${error.message}`);
  return (data ?? []).map((r) => ({ ...(r as MileageEntry), miles: Number((r as MileageEntry).miles) }));
}

export async function listJobExpenses(workOrderId: string, tenantId: string): Promise<JobExpense[]> {
  const { data, error } = await db
    .from("job_expenses").select("*")
    .eq("work_order_id", workOrderId).eq("tenant_id", tenantId)
    .order("incurred_on", { ascending: false });
  if (error) throw new Error(`[db] listJobExpenses: ${error.message}`);
  return (data ?? []).map((r) => ({ ...(r as JobExpense), markup_percent: Number((r as JobExpense).markup_percent) }));
}

export async function getTimeEntryById(id: string, tenantId: string): Promise<TimeEntry | undefined> {
  const { data } = await db.from("time_entries").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return (data as TimeEntry) ?? undefined;
}
export async function getMileageEntryById(id: string, tenantId: string): Promise<MileageEntry | undefined> {
  const { data } = await db.from("mileage_entries").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return data ? { ...(data as MileageEntry), miles: Number((data as MileageEntry).miles) } : undefined;
}
export async function getJobExpenseById(id: string, tenantId: string): Promise<JobExpense | undefined> {
  const { data } = await db.from("job_expenses").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return data ? { ...(data as JobExpense), markup_percent: Number((data as JobExpense).markup_percent) } : undefined;
}

// ─── The rollup (ADR-0016 §2) ────────────────────────────────────────────────

/**
 * Recompute work_orders.actual_cost_cents from the FULL set of entries and
 * write it as an ABSOLUTE value.
 *
 * Never `actual_cost_cents += x`. An increment is a lost update waiting to
 * happen under concurrency/retry and can drift with no way to detect it; a
 * recompute is self-healing — the entries stay the single source of truth and
 * this column is only ever a cache of a pure function over them.
 */
export async function recomputeWorkOrderCost(workOrderId: string, tenantId: string): Promise<JobCostSummary> {
  const [time, mileage, expenses, woRes] = await Promise.all([
    listTimeEntries(workOrderId, tenantId),
    listMileageEntries(workOrderId, tenantId),
    listJobExpenses(workOrderId, tenantId),
    db.from("work_orders").select("approved_contract_amount_cents").eq("id", workOrderId).eq("tenant_id", tenantId).maybeSingle(),
  ]);

  const contract = ((woRes.data as { approved_contract_amount_cents?: number } | null)?.approved_contract_amount_cents) ?? 0;

  const entries: CostEntries = {
    time: time.map((e) => ({ minutes: e.minutes, cost_cents: e.cost_cents })),
    mileage: mileage.map((e) => ({ miles: e.miles, cost_cents: e.cost_cents })),
    expenses: expenses.map((e) => ({ amount_cents: e.amount_cents, billable_amount_cents: e.billable_amount_cents })),
  };

  const summary = summarizeJobCost(workOrderId, contract, entries);

  const { error } = await db
    .from("work_orders")
    .update({ actual_cost_cents: summary.total_cost_cents })
    .eq("id", workOrderId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`[db] recomputeWorkOrderCost: ${error.message}`);

  return summary;
}

/** Read-only summary (no write). Used by the costing panel. */
export async function getJobCostSummary(workOrderId: string, tenantId: string): Promise<JobCostSummary> {
  const [time, mileage, expenses, woRes] = await Promise.all([
    listTimeEntries(workOrderId, tenantId),
    listMileageEntries(workOrderId, tenantId),
    listJobExpenses(workOrderId, tenantId),
    db.from("work_orders").select("approved_contract_amount_cents").eq("id", workOrderId).eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const contract = ((woRes.data as { approved_contract_amount_cents?: number } | null)?.approved_contract_amount_cents) ?? 0;
  return summarizeJobCost(workOrderId, contract, {
    time: time.map((e) => ({ minutes: e.minutes, cost_cents: e.cost_cents })),
    mileage: mileage.map((e) => ({ miles: e.miles, cost_cents: e.cost_cents })),
    expenses: expenses.map((e) => ({ amount_cents: e.amount_cents, billable_amount_cents: e.billable_amount_cents })),
  });
}

// ─── Writes — the server prices every entry ──────────────────────────────────

export async function createTimeEntry(
  input: CreateTimeEntryInput, technicianId: string, tenantId: string, userId: string
): Promise<TimeEntry> {
  // Minutes is canonical; derive it from the timer only when one was used.
  const minutes = input.minutes ?? minutesBetween(input.started_at!, input.ended_at!);

  const [techRate, tenantRates] = await Promise.all([
    getTechnicianRate(technicianId, tenantId),
    getTenantRates(tenantId),
  ]);
  const hourly = resolveHourlyCostCents(techRate, tenantRates.labor);

  const { data, error } = await db
    .from("time_entries")
    .insert({
      tenant_id: tenantId,
      work_order_id: input.work_order_id,
      visit_id: input.visit_id ?? null,
      technician_id: technicianId,
      minutes,
      started_at: input.started_at ?? null,
      ended_at: input.ended_at ?? null,
      hourly_cost_cents: hourly,
      cost_cents: computeLaborCost(minutes, hourly),
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createTimeEntry: ${error.message}`);

  await recomputeWorkOrderCost(input.work_order_id, tenantId);
  return data as TimeEntry;
}

export async function updateTimeEntry(
  id: string, patch: UpdateTimeEntryInput, tenantId: string
): Promise<TimeEntry | undefined> {
  const existing = await getTimeEntryById(id, tenantId);
  if (!existing) return undefined;

  const payload: Record<string, unknown> = {};
  if (patch.notes !== undefined) payload.notes = patch.notes ?? null;
  if (patch.minutes !== undefined) {
    payload.minutes = patch.minutes;
    // Re-price against the entry's FROZEN rate, not today's rate — editing a
    // typo must not silently re-cost the entry at a newer wage (ADR-0016 §1).
    payload.cost_cents = computeLaborCost(patch.minutes, existing.hourly_cost_cents);
  }
  if (Object.keys(payload).length === 0) return existing;

  const { data, error } = await db
    .from("time_entries").update(payload).eq("id", id).eq("tenant_id", tenantId).select("*").single();
  if (error) throw new Error(`[db] updateTimeEntry: ${error.message}`);

  await recomputeWorkOrderCost(existing.work_order_id, tenantId);
  return data as TimeEntry;
}

export async function deleteTimeEntry(id: string, tenantId: string): Promise<boolean> {
  const existing = await getTimeEntryById(id, tenantId);
  if (!existing) return false;
  const { error } = await db.from("time_entries").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(`[db] deleteTimeEntry: ${error.message}`);
  await recomputeWorkOrderCost(existing.work_order_id, tenantId);
  return true;
}

export async function createMileageEntry(
  input: CreateMileageEntryInput, technicianId: string, tenantId: string, userId: string
): Promise<MileageEntry> {
  const rates = await getTenantRates(tenantId);
  const rate = rates.mileage;

  const { data, error } = await db
    .from("mileage_entries")
    .insert({
      tenant_id: tenantId,
      work_order_id: input.work_order_id,
      visit_id: input.visit_id ?? null,
      technician_id: technicianId,
      miles: input.miles,
      rate_cents_per_mile: rate,
      cost_cents: computeMileageCost(input.miles, rate),
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createMileageEntry: ${error.message}`);

  await recomputeWorkOrderCost(input.work_order_id, tenantId);
  return { ...(data as MileageEntry), miles: Number((data as MileageEntry).miles) };
}

export async function updateMileageEntry(
  id: string, patch: UpdateMileageEntryInput, tenantId: string
): Promise<MileageEntry | undefined> {
  const existing = await getMileageEntryById(id, tenantId);
  if (!existing) return undefined;

  const payload: Record<string, unknown> = {};
  if (patch.notes !== undefined) payload.notes = patch.notes ?? null;
  if (patch.miles !== undefined) {
    payload.miles = patch.miles;
    // Re-price against the frozen snapshot rate (see updateTimeEntry).
    payload.cost_cents = computeMileageCost(patch.miles, existing.rate_cents_per_mile);
  }
  if (Object.keys(payload).length === 0) return existing;

  const { data, error } = await db
    .from("mileage_entries").update(payload).eq("id", id).eq("tenant_id", tenantId).select("*").single();
  if (error) throw new Error(`[db] updateMileageEntry: ${error.message}`);

  await recomputeWorkOrderCost(existing.work_order_id, tenantId);
  return { ...(data as MileageEntry), miles: Number((data as MileageEntry).miles) };
}

export async function deleteMileageEntry(id: string, tenantId: string): Promise<boolean> {
  const existing = await getMileageEntryById(id, tenantId);
  if (!existing) return false;
  const { error } = await db.from("mileage_entries").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(`[db] deleteMileageEntry: ${error.message}`);
  await recomputeWorkOrderCost(existing.work_order_id, tenantId);
  return true;
}

export async function createJobExpense(
  input: CreateJobExpenseInput, tenantId: string, userId: string, receiptPath?: string | null
): Promise<JobExpense> {
  const { data, error } = await db
    .from("job_expenses")
    .insert({
      tenant_id: tenantId,
      work_order_id: input.work_order_id,
      visit_id: input.visit_id ?? null,
      category: input.category,
      description: input.description,
      vendor: input.vendor ?? null,
      amount_cents: input.amount_cents,
      billable: input.billable,
      markup_percent: input.markup_percent,
      billable_amount_cents: computeBillableAmount(input.amount_cents, input.billable, input.markup_percent),
      receipt_path: receiptPath ?? null,
      incurred_on: input.incurred_on,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createJobExpense: ${error.message}`);

  await recomputeWorkOrderCost(input.work_order_id, tenantId);
  return { ...(data as JobExpense), markup_percent: Number((data as JobExpense).markup_percent) };
}

export async function updateJobExpense(
  id: string, patch: UpdateJobExpenseInput, tenantId: string
): Promise<JobExpense | undefined> {
  const existing = await getJobExpenseById(id, tenantId);
  if (!existing) return undefined;

  const amount = patch.amount_cents ?? existing.amount_cents;
  const billable = patch.billable ?? existing.billable;
  const markup = patch.markup_percent ?? existing.markup_percent;

  const payload: Record<string, unknown> = {};
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.vendor !== undefined) payload.vendor = patch.vendor ?? null;
  if (patch.incurred_on !== undefined) payload.incurred_on = patch.incurred_on;
  if (patch.amount_cents !== undefined || patch.billable !== undefined || patch.markup_percent !== undefined) {
    payload.amount_cents = amount;
    payload.billable = billable;
    payload.markup_percent = markup;
    payload.billable_amount_cents = computeBillableAmount(amount, billable, markup);
  }
  if (Object.keys(payload).length === 0) return existing;

  const { data, error } = await db
    .from("job_expenses").update(payload).eq("id", id).eq("tenant_id", tenantId).select("*").single();
  if (error) throw new Error(`[db] updateJobExpense: ${error.message}`);

  await recomputeWorkOrderCost(existing.work_order_id, tenantId);
  return { ...(data as JobExpense), markup_percent: Number((data as JobExpense).markup_percent) };
}

export async function deleteJobExpense(id: string, tenantId: string): Promise<boolean> {
  const existing = await getJobExpenseById(id, tenantId);
  if (!existing) return false;
  const { error } = await db.from("job_expenses").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(`[db] deleteJobExpense: ${error.message}`);
  await recomputeWorkOrderCost(existing.work_order_id, tenantId);
  return true;
}
