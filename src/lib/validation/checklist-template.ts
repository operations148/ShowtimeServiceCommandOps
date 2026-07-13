import { z } from "zod";
import { ServiceCategory } from "@/types/work-order";

const versionToken = z.number().int().min(1, "version must be >= 1");

export const ChecklistTemplateItemInputSchema = z.object({
  label: z.string().min(1, "Label is required").max(300).transform((v) => v.trim()),
  is_required: z.boolean().default(true),
  conditional_categories: z.array(z.nativeEnum(ServiceCategory)).max(20).optional(),
  sort_order: z.number().int().min(0).max(1000).default(0),
});
export type ChecklistTemplateItemInput = z.infer<typeof ChecklistTemplateItemInputSchema>;

export const CreateChecklistTemplateSchema = z.object({
  service_category: z.nativeEnum(ServiceCategory),
  name: z.string().min(1, "Name is required").max(200).transform((v) => v.trim()),
  items: z.array(ChecklistTemplateItemInputSchema).max(100).default([]),
});
export type CreateChecklistTemplateInput = z.infer<typeof CreateChecklistTemplateSchema>;

export const PatchChecklistTemplateSchema = z.object({
  version: versionToken,
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  is_active: z.boolean().optional(),
  items: z.array(ChecklistTemplateItemInputSchema).max(100).optional(),
});
export type PatchChecklistTemplateInput = z.infer<typeof PatchChecklistTemplateSchema>;
