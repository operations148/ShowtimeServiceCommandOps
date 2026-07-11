import { db } from "@/lib/db/client";
import type { ChecklistTemplate, ChecklistTemplateItem, ResolvedChecklistItem, VisitChecklistSnapshot } from "@/types/checklist-template";
import type { ServiceCategory } from "@/types/work-order";
import type { CreateChecklistTemplateInput, PatchChecklistTemplateInput } from "@/lib/validation/checklist-template";
import { checklistTemplates as staticTemplates } from "@/config/checklist-templates";

type TemplateRow = {
  id: string;
  tenant_id: string;
  service_category: string;
  name: string;
  is_active: boolean;
  archived_at: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  tenant_id: string;
  template_id: string;
  label: string;
  is_required: boolean;
  conditional_categories: string[] | null;
  sort_order: number;
  created_at: string;
};

function mapTemplate(row: TemplateRow, items?: ChecklistTemplateItem[]): ChecklistTemplate {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    service_category: row.service_category as ServiceCategory,
    name: row.name,
    is_active: row.is_active,
    archived_at: row.archived_at,
    version: row.version,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items,
  };
}

function mapItem(row: ItemRow): ChecklistTemplateItem {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    template_id: row.template_id,
    label: row.label,
    is_required: row.is_required,
    conditional_categories: (row.conditional_categories as ServiceCategory[] | null) ?? null,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

export async function listChecklistTemplates(tenantId: string): Promise<ChecklistTemplate[]> {
  const { data, error } = await db
    .from("checklist_templates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("service_category", { ascending: true });
  if (error) throw new Error(`[db] listChecklistTemplates: ${error.message}`);
  return ((data ?? []) as TemplateRow[]).map((r) => mapTemplate(r));
}

export async function getChecklistTemplateWithItems(id: string, tenantId: string): Promise<ChecklistTemplate | undefined> {
  const { data, error } = await db.from("checklist_templates").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`[db] getChecklistTemplateWithItems: ${error.message}`);
  if (!data) return undefined;
  const items = await getTemplateItems(id, tenantId);
  return mapTemplate(data as TemplateRow, items);
}

async function getTemplateItems(templateId: string, tenantId: string): Promise<ChecklistTemplateItem[]> {
  const { data, error } = await db
    .from("checklist_template_items")
    .select("*")
    .eq("template_id", templateId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[db] getTemplateItems: ${error.message}`);
  return ((data ?? []) as ItemRow[]).map(mapItem);
}

export type ChecklistTemplateWriteResult =
  | { ok: true; data: ChecklistTemplate }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; duplicateCategory: true };

export async function createChecklistTemplate(
  input: CreateChecklistTemplateInput,
  tenantId: string,
  userId: string
): Promise<ChecklistTemplateWriteResult> {
  const { data, error } = await db
    .from("checklist_templates")
    .insert({ tenant_id: tenantId, service_category: input.service_category, name: input.name, created_by: userId, updated_by: userId })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, duplicateCategory: true };
    throw new Error(`[db] createChecklistTemplate: ${error.message}`);
  }
  const templateRow = data as TemplateRow;

  let items: ChecklistTemplateItem[] = [];
  if (input.items.length > 0) {
    const { data: itemData, error: itemErr } = await db
      .from("checklist_template_items")
      .insert(
        input.items.map((it) => ({
          tenant_id: tenantId,
          template_id: templateRow.id,
          label: it.label,
          is_required: it.is_required,
          conditional_categories: it.conditional_categories ?? null,
          sort_order: it.sort_order,
        }))
      )
      .select("*");
    if (itemErr) throw new Error(`[db] createChecklistTemplate items: ${itemErr.message}`);
    items = ((itemData ?? []) as ItemRow[]).map(mapItem);
  }

  return { ok: true, data: mapTemplate(templateRow, items) };
}

export async function patchChecklistTemplate(
  id: string,
  patch: PatchChecklistTemplateInput,
  tenantId: string,
  userId: string
): Promise<ChecklistTemplateWriteResult> {
  const existing = await getChecklistTemplateWithItems(id, tenantId);
  if (!existing) return { ok: false, notFound: true };
  if (existing.version !== patch.version) return { ok: false, conflict: true, currentVersion: existing.version };

  const payload: Record<string, unknown> = { version: patch.version + 1, updated_by: userId };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  const { data, error } = await db
    .from("checklist_templates")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", patch.version)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] patchChecklistTemplate: ${error.message}`);
  if (!data) {
    const fresh = await getChecklistTemplateWithItems(id, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version } : { ok: false, notFound: true };
  }

  if (patch.items !== undefined) {
    await db.from("checklist_template_items").delete().eq("template_id", id).eq("tenant_id", tenantId);
    if (patch.items.length > 0) {
      const { error: itemErr } = await db.from("checklist_template_items").insert(
        patch.items.map((it) => ({
          tenant_id: tenantId,
          template_id: id,
          label: it.label,
          is_required: it.is_required,
          conditional_categories: it.conditional_categories ?? null,
          sort_order: it.sort_order,
        }))
      );
      if (itemErr) throw new Error(`[db] patchChecklistTemplate items: ${itemErr.message}`);
    }
  }

  const items = await getTemplateItems(id, tenantId);
  return { ok: true, data: mapTemplate(data as TemplateRow, items) };
}

export async function archiveChecklistTemplate(id: string, tenantId: string, userId: string): Promise<ChecklistTemplateWriteResult> {
  const { data, error } = await db
    .from("checklist_templates")
    .update({ archived_at: new Date().toISOString(), is_active: false, updated_by: userId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] archiveChecklistTemplate: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapTemplate(data as TemplateRow) };
}

// ─── Resolution: tenant template overlay -> static config fallback ────────────

/**
 * Resolves the checklist a technician should see for a work order's service
 * category: an active tenant-configured template (if one exists), otherwise
 * the static fallback from src/config/checklist-templates.ts (all items
 * required by default — the static config predates the required/optional
 * distinction).
 */
export async function resolveChecklistForCategory(
  tenantId: string,
  serviceCategory: ServiceCategory
): Promise<{ items: ResolvedChecklistItem[]; templateId: string | null; templateVersion: number | null }> {
  const { data } = await db
    .from("checklist_templates")
    .select("id, version")
    .eq("tenant_id", tenantId)
    .eq("service_category", serviceCategory)
    .eq("is_active", true)
    .is("archived_at", null)
    .maybeSingle();

  if (data) {
    const template = data as { id: string; version: number };
    const items = await getTemplateItems(template.id, tenantId);
    return {
      items: items.map((it) => ({ label: it.label, is_required: it.is_required, completed: false, notes: null })),
      templateId: template.id,
      templateVersion: template.version,
    };
  }

  const fallback = staticTemplates.find((t) => t.serviceCategory === serviceCategory);
  return {
    items: (fallback?.items ?? []).map((label) => ({ label, is_required: true, completed: false, notes: null })),
    templateId: null,
    templateVersion: null,
  };
}

// ─── Immutable completion snapshot ─────────────────────────────────────────────

export async function writeVisitChecklistSnapshot(
  visitId: string,
  tenantId: string,
  items: ResolvedChecklistItem[],
  templateId: string | null,
  templateVersion: number | null
): Promise<VisitChecklistSnapshot> {
  const { data, error } = await db
    .from("visit_checklist_snapshots")
    .insert({
      tenant_id: tenantId,
      visit_id: visitId,
      template_id: templateId,
      template_version: templateVersion,
      items,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] writeVisitChecklistSnapshot: ${error.message}`);
  return data as VisitChecklistSnapshot;
}

export async function getVisitChecklistSnapshots(visitId: string, tenantId: string): Promise<VisitChecklistSnapshot[]> {
  const { data, error } = await db
    .from("visit_checklist_snapshots")
    .select("*")
    .eq("visit_id", visitId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] getVisitChecklistSnapshots: ${error.message}`);
  return (data ?? []) as VisitChecklistSnapshot[];
}
