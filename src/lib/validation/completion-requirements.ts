import { z } from "zod";
import { ServiceCategory } from "@/types/work-order";

/** service_category omitted/null means "the tenant-wide default row". */
export const SetCompletionRuleSchema = z.object({
  service_category: z.nativeEnum(ServiceCategory).nullable().optional(),
  require_checklist_complete: z.boolean().default(true),
  require_photos: z.boolean().default(true),
  require_technician_note: z.boolean().default(false),
  require_customer_signature: z.boolean().default(false),
  require_equipment_reading: z.boolean().default(false),
  require_time_entry: z.boolean().default(false),
  require_material_usage: z.boolean().default(false),
  require_completion_reason: z.boolean().default(false),
});
export type SetCompletionRuleInput = z.infer<typeof SetCompletionRuleSchema>;

/** Fields captured on the visit at completion time — feeds the evaluator. */
export const VisitCompletionCaptureSchema = z.object({
  customer_signature: z.string().max(20000).optional(),
  equipment_reading: z.string().max(500).optional(),
  time_entry_minutes: z.number().int().min(0).max(1440).optional(),
  material_usage: z.string().max(2000).optional(),
  completion_reason: z.string().max(1000).optional(),
});
export type VisitCompletionCaptureInput = z.infer<typeof VisitCompletionCaptureSchema>;
