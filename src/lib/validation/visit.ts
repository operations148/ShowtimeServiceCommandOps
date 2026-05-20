import { z } from "zod";
import { VisitStatus } from "@/types/visit";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const ChecklistItemSchema = z.object({
  id:        z.string(),
  label:     z.string(),
  completed: z.boolean(),
  notes:     z.string().optional(),
});

// ---------------------------------------------------------------------------
// CreateVisitSchema
// Used by POST /api/visits.
// tenant_id is injected server-side — never accepted from the request body.
// ---------------------------------------------------------------------------

export const CreateVisitSchema = z.object({
  work_order_id:    z.string().min(1, "work_order_id is required"),
  property_id:      z.string().min(1, "property_id is required"),
  technician_id:    z.string().optional(),
  status:           z.nativeEnum(VisitStatus).default(VisitStatus.SCHEDULED),
  scheduled_date:   z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)"),
  checklist:        z.array(ChecklistItemSchema).default([]),
  technician_notes: z.string().max(5000).optional(),
  photo_urls:       z.array(z.string().url("Each photo_url must be a valid URL")).default([]),
  estimate_flagged: z.boolean().default(false),
  completed_at:     z.string().optional(),
});

export type CreateVisitInput = z.infer<typeof CreateVisitSchema>;

// ---------------------------------------------------------------------------
// PatchVisitSchema
// Used by PATCH /api/visits/[id].
// All fields optional. Immutable fields (tenant_id, work_order_id, etc.)
// are never accepted in the body — ignored even if present.
// ---------------------------------------------------------------------------

export const PatchVisitSchema = z.object({
  status:              z.nativeEnum(VisitStatus).optional(),
  checklist:           z.array(ChecklistItemSchema).optional(),
  technician_notes:    z.string().max(5000).optional(),
  estimate_flagged:    z.boolean().optional(),
  estimate_flag_notes: z.string().max(500).optional(),
  completed_at:        z.string().optional(),
  completion_message:  z.string().max(500).optional(),
  completed_by_name:   z.string().max(200).optional(),
});

export type PatchVisitInput = z.infer<typeof PatchVisitSchema>;
