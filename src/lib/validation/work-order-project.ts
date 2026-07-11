import { z } from "zod";

// ─── Internal tasks ────────────────────────────────────────────────────────────

export const CreateWorkOrderTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(300).transform((v) => v.trim()),
  assigned_technician_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  sort_order: z.number().int().min(0).max(1000).default(0),
});
export type CreateWorkOrderTaskInput = z.infer<typeof CreateWorkOrderTaskSchema>;

export const PatchWorkOrderTaskSchema = z.object({
  title: z.string().min(1).max(300).transform((v) => v.trim()).optional(),
  is_completed: z.boolean().optional(),
  assigned_technician_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
});
export type PatchWorkOrderTaskInput = z.infer<typeof PatchWorkOrderTaskSchema>;

// ─── Attachments ───────────────────────────────────────────────────────────────

export const PatchWorkOrderAttachmentSchema = z.object({
  is_customer_visible: z.boolean(),
});
export type PatchWorkOrderAttachmentInput = z.infer<typeof PatchWorkOrderAttachmentSchema>;

// ─── Attachment auto-rules ─────────────────────────────────────────────────────

export const CreateAttachmentRuleSchema = z.object({
  service_category: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  description: z.string().max(500).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  is_active: z.boolean().default(true),
});
export type CreateAttachmentRuleInput = z.infer<typeof CreateAttachmentRuleSchema>;

// ─── Work order project actions ───────────────────────────────────────────────

const versionToken = z.number().int().min(1, "version must be >= 1");

export const CloseWorkOrderSchema = z.object({ version: versionToken });
export type CloseWorkOrderInput = z.infer<typeof CloseWorkOrderSchema>;

export const ReopenWorkOrderSchema = z.object({ version: versionToken });
export type ReopenWorkOrderInput = z.infer<typeof ReopenWorkOrderSchema>;

export const CreateChildWorkOrderSchema = z.object({
  title: z.string().min(1, "Title is required").max(120).transform((v) => v.trim()),
  scheduled_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});
export type CreateChildWorkOrderInput = z.infer<typeof CreateChildWorkOrderSchema>;
