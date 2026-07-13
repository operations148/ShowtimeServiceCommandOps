import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Invalid time (HH:MM)");
const isoDatetime = z.string().datetime({ offset: true });
const versionToken = z.number().int().min(1, "version must be >= 1");

// ─── Schedule feed query (calendar range) ─────────────────────────────────────

export const ScheduleFeedQuerySchema = z.object({
  /** Inclusive tenant-local start date. */
  from: dateStr,
  /** Inclusive tenant-local end date. */
  to: dateStr,
  technician_id: z.string().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  /** "unassigned" | "overdue" | "all" (default all within range). */
  scope: z.enum(["all", "unassigned", "overdue"]).optional(),
});
export type ScheduleFeedQuery = z.infer<typeof ScheduleFeedQuerySchema>;

// ─── Assignment (multi-technician) ────────────────────────────────────────────

export const AssignVisitSchema = z.object({
  version: versionToken,
  /** Lead technician (nullable to unassign). */
  lead_technician_id: z.string().uuid().nullable(),
  /** Additional technician ids (assistants). Must not include the lead. */
  assistant_technician_ids: z.array(z.string().uuid()).max(10).default([]),
});
export type AssignVisitInput = z.infer<typeof AssignVisitSchema>;

// ─── Reschedule (versioned, reason optional but recorded) ─────────────────────

export const RescheduleVisitSchema = z.object({
  version: versionToken,
  scheduled_date: dateStr,
  /** Tenant-local wall time; when present, planned_start/end are derived server-side. */
  start_time: timeStr.optional(),
  duration_minutes: z.number().int().min(1).max(1440).optional(),
  arrival_window_start: timeStr.optional(),
  arrival_window_end: timeStr.optional(),
  all_day: z.boolean().optional(),
  reason: z.string().max(1000).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});
export type RescheduleVisitInput = z.infer<typeof RescheduleVisitSchema>;

// ─── Route ordering (manual) ──────────────────────────────────────────────────

export const RouteOrderSchema = z.object({
  /** Ordered visit ids for one technician on one day. */
  visit_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type RouteOrderInput = z.infer<typeof RouteOrderSchema>;

// ─── Blocked time ─────────────────────────────────────────────────────────────

export const CreateBlockedTimeSchema = z
  .object({
    technician_id: z.string().uuid(),
    starts_at: isoDatetime,
    ends_at: isoDatetime,
    all_day: z.boolean().default(false),
    reason: z.string().max(500).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: "ends_at must be after starts_at",
    path: ["ends_at"],
  });
export type CreateBlockedTimeInput = z.infer<typeof CreateBlockedTimeSchema>;

// ─── Technician availability (replace weekly template) ────────────────────────

export const SetAvailabilitySchema = z.object({
  technician_id: z.string().uuid(),
  windows: z
    .array(
      z
        .object({
          day_of_week: z.number().int().min(0).max(6),
          start_time: timeStr,
          end_time: timeStr,
        })
        .refine((w) => w.end_time > w.start_time, { message: "end_time must be after start_time", path: ["end_time"] })
    )
    .max(50),
});
export type SetAvailabilityInput = z.infer<typeof SetAvailabilitySchema>;

// ─── Recurring schedule controls ──────────────────────────────────────────────

export const RecurringPauseSchema = z.object({
  version: versionToken,
  paused: z.boolean(),
});
export type RecurringPauseInput = z.infer<typeof RecurringPauseSchema>;

export const SkipOccurrenceSchema = z.object({
  exception_date: dateStr,
  reason: z.string().max(500).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});
export type SkipOccurrenceInput = z.infer<typeof SkipOccurrenceSchema>;

export const RecurringPreviewQuerySchema = z.object({
  /** Horizon in weeks to preview (default 4, capped). */
  weeks: z.coerce.number().int().min(1).max(26).default(4),
});
export type RecurringPreviewQuery = z.infer<typeof RecurringPreviewQuerySchema>;
