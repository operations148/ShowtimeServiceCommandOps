import { z } from "zod";
import { ServiceCategory, Priority, WorkOrderStatus, EstimateHandoffStatus } from "@/types/work-order";

// Schema for the fields the user fills in on the New Work Order form.
// property_id and tenant_id are added server-side from session context.
export const NewWorkOrderSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or less")
    .transform((v) => v.trim()),

  service_category: z.nativeEnum(ServiceCategory, {
    message: "Please select a service category",
  }),

  priority: z.nativeEnum(Priority).default(Priority.NORMAL),

  description: z
    .string()
    .max(2000, "Description must be under 2000 characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  assigned_technician_id: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

export type NewWorkOrderInput = z.infer<typeof NewWorkOrderSchema>;

// Flat field errors shape — used for form error state
export type NewWorkOrderFieldErrors = Partial<Record<keyof NewWorkOrderInput, string>>;

// Schema for PATCH /api/work-orders/[id] — all fields optional.
// Status transition validity is enforced in the route handler, not here.
export const PatchWorkOrderSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(120, "Title must be 120 characters or less")
    .transform((v) => v.trim())
    .optional(),

  service_category: z.nativeEnum(ServiceCategory).optional(),

  priority: z.nativeEnum(Priority).optional(),

  description: z
    .string()
    .max(2000, "Description must be under 2000 characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  scheduled_time_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Invalid time format")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  scheduled_time_end: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Invalid time format")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  assigned_technician_id: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  status: z.nativeEnum(WorkOrderStatus).optional(),

  estimate_handoff_status: z.nativeEnum(EstimateHandoffStatus).optional(),

  retry_ghl_sync: z.boolean().optional(),

  property_id: z
    .string()
    .uuid("Invalid property ID")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),

  estimate_notes: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

export type PatchWorkOrderInput = z.infer<typeof PatchWorkOrderSchema>;
