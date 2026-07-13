import { db } from "@/lib/db/client";
import type { CompletionRequirementRule } from "@/types/completion-requirements";
import type { ServiceCategory } from "@/types/work-order";
import type { SetCompletionRuleInput } from "@/lib/validation/completion-requirements";
import { resolveCompletionRule as resolveCompletionRulePure, DEFAULT_COMPLETION_RULE } from "@/lib/work-orders/completion-requirements";

export async function listCompletionRules(tenantId: string): Promise<CompletionRequirementRule[]> {
  const { data, error } = await db.from("completion_requirement_rules").select("*").eq("tenant_id", tenantId);
  if (error) throw new Error(`[db] listCompletionRules: ${error.message}`);
  return (data ?? []) as CompletionRequirementRule[];
}

/** Upserts the rule for a category (or the tenant default when category is null). */
export async function setCompletionRule(
  input: SetCompletionRuleInput,
  tenantId: string
): Promise<CompletionRequirementRule> {
  const category = input.service_category ?? null;

  let existingQuery = db.from("completion_requirement_rules").select("id").eq("tenant_id", tenantId);
  existingQuery = category === null ? existingQuery.is("service_category", null) : existingQuery.eq("service_category", category);
  const { data: existing } = await existingQuery.maybeSingle();

  const payload = {
    tenant_id: tenantId,
    service_category: category,
    require_checklist_complete: input.require_checklist_complete,
    require_photos: input.require_photos,
    require_technician_note: input.require_technician_note,
    require_customer_signature: input.require_customer_signature,
    require_equipment_reading: input.require_equipment_reading,
    require_time_entry: input.require_time_entry,
    require_material_usage: input.require_material_usage,
    require_completion_reason: input.require_completion_reason,
  };

  if (existing) {
    const { data, error } = await db
      .from("completion_requirement_rules")
      .update(payload)
      .eq("id", (existing as { id: string }).id)
      .select("*")
      .single();
    if (error) throw new Error(`[db] setCompletionRule update: ${error.message}`);
    return data as CompletionRequirementRule;
  }

  const { data, error } = await db.from("completion_requirement_rules").insert(payload).select("*").single();
  if (error) throw new Error(`[db] setCompletionRule insert: ${error.message}`);
  return data as CompletionRequirementRule;
}

/** Resolves the effective rule for a tenant/service category, falling back
 * through: exact category row -> tenant default row -> hardcoded baseline. */
export async function resolveCompletionRuleForTenant(
  tenantId: string,
  serviceCategory: ServiceCategory
): Promise<CompletionRequirementRule | typeof DEFAULT_COMPLETION_RULE> {
  const rules = await listCompletionRules(tenantId);
  return resolveCompletionRulePure(rules, serviceCategory);
}
