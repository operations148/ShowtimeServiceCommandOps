// Tenant-versioned checklist templates (Phase 5). Overlays — does not
// replace — the static fallback in src/config/checklist-templates.ts.

import type { ServiceCategory } from "@/types/work-order";

export interface ChecklistTemplateItem {
  id: string;
  tenant_id: string;
  template_id: string;
  label: string;
  is_required: boolean;
  /** Additional service categories this item applies to beyond the template's own. */
  conditional_categories?: ServiceCategory[] | null;
  sort_order: number;
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  tenant_id: string;
  service_category: ServiceCategory;
  name: string;
  is_active: boolean;
  archived_at?: string | null;
  /** Optimistic-concurrency token; also captured as provenance in visit_checklist_snapshots. */
  version: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  items?: ChecklistTemplateItem[];
}

/** A single resolved checklist entry, as rendered to the technician or snapshotted. */
export interface ResolvedChecklistItem {
  label: string;
  is_required: boolean;
  completed: boolean;
  notes?: string | null;
}

export interface VisitChecklistSnapshot {
  id: string;
  tenant_id: string;
  visit_id: string;
  template_id?: string | null;
  template_version?: number | null;
  items: ResolvedChecklistItem[];
  created_at: string;
}
