import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/types/costing";
import { MAX_MINUTES_PER_ENTRY, MAX_MILES_PER_ENTRY } from "@/lib/costing/costing";

/**
 * Job-costing input validation (Phase 9).
 *
 * NOTE what these schemas deliberately DO NOT accept: hourly_cost_cents,
 * rate_cents_per_mile, cost_cents, billable_amount_cents. The client sends
 * quantities (minutes / miles / amount); the SERVER prices them from
 * server-held rates (ADR-0016 §3). There is no path for a field app to propose
 * what labor is worth. Bounds mirror the DB CHECK constraints.
 */

const uuid = z.string().uuid();
const optionalNote = z.string().max(2000).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

// ─── Time ─────────────────────────────────────────────────────────────────────

export const CreateTimeEntrySchema = z
  .object({
    work_order_id: uuid,
    visit_id: uuid.optional(),
    technician_id: uuid.optional(), // defaults to the caller's own technician
    minutes: z.number().int().min(1).max(MAX_MINUTES_PER_ENTRY).optional(),
    started_at: z.string().datetime().optional(),
    ended_at: z.string().datetime().optional(),
    notes: optionalNote,
  })
  .refine((d) => d.minutes !== undefined || (d.started_at !== undefined && d.ended_at !== undefined), {
    message: "Provide minutes, or both started_at and ended_at",
    path: ["minutes"],
  })
  .refine((d) => !(d.started_at !== undefined) || d.ended_at !== undefined, {
    message: "ended_at is required when started_at is given",
    path: ["ended_at"],
  });
export type CreateTimeEntryInput = z.infer<typeof CreateTimeEntrySchema>;

export const UpdateTimeEntrySchema = z.object({
  minutes: z.number().int().min(1).max(MAX_MINUTES_PER_ENTRY).optional(),
  notes: optionalNote,
});
export type UpdateTimeEntryInput = z.infer<typeof UpdateTimeEntrySchema>;

// ─── Mileage ──────────────────────────────────────────────────────────────────

export const CreateMileageEntrySchema = z.object({
  work_order_id: uuid,
  visit_id: uuid.optional(),
  technician_id: uuid.optional(),
  // Miles is the one legitimately fractional quantity; 2dp mirrors NUMERIC(8,2).
  miles: z.number().positive().max(MAX_MILES_PER_ENTRY).refine(
    (v) => Number.isFinite(v) && Math.round(v * 100) === Number((v * 100).toFixed(0)),
    { message: "miles supports at most 2 decimal places" }
  ),
  notes: optionalNote,
});
export type CreateMileageEntryInput = z.infer<typeof CreateMileageEntrySchema>;

export const UpdateMileageEntrySchema = z.object({
  miles: z.number().positive().max(MAX_MILES_PER_ENTRY).optional(),
  notes: optionalNote,
});
export type UpdateMileageEntryInput = z.infer<typeof UpdateMileageEntrySchema>;

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const CreateJobExpenseSchema = z.object({
  work_order_id: uuid,
  visit_id: uuid.optional(),
  category: z.enum(EXPENSE_CATEGORIES as [string, ...string[]]),
  description: z.string().min(1, "Description is required").max(500).transform((v) => v.trim()),
  vendor: z.string().max(200).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  /** Integer cents — what we paid. */
  amount_cents: z.number().int().min(0).max(100_000_000),
  billable: z.boolean().default(false),
  markup_percent: z.number().min(0).max(1000).default(0),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "incurred_on must be YYYY-MM-DD"),
  notes: optionalNote,
});
export type CreateJobExpenseInput = z.infer<typeof CreateJobExpenseSchema>;

export const UpdateJobExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES as [string, ...string[]]).optional(),
  description: z.string().min(1).max(500).transform((v) => v.trim()).optional(),
  vendor: z.string().max(200).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  amount_cents: z.number().int().min(0).max(100_000_000).optional(),
  billable: z.boolean().optional(),
  markup_percent: z.number().min(0).max(1000).optional(),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type UpdateJobExpenseInput = z.infer<typeof UpdateJobExpenseSchema>;

// ─── Rate settings (owner-only) ──────────────────────────────────────────────

export const UpdateCostingRatesSchema = z.object({
  default_mileage_rate_cents: z.number().int().min(0).max(10_000).optional(),
  default_labor_cost_cents: z.number().int().min(0).max(1_000_000).optional(),
});
export type UpdateCostingRatesInput = z.infer<typeof UpdateCostingRatesSchema>;

export const UpdateTechnicianRateSchema = z.object({
  hourly_cost_cents: z.number().int().min(0).max(1_000_000),
});
export type UpdateTechnicianRateInput = z.infer<typeof UpdateTechnicianRateSchema>;
