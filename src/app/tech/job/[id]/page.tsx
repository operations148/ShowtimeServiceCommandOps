import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MOCK_WORK_ORDERS } from "@/lib/mock-data/work-orders";
import { MOCK_PROPERTIES } from "@/lib/mock-data/properties";
import { checklistTemplates } from "@/config/checklist-templates";
import { getOrCreateVisit } from "@/lib/mock-data/visit-store";
import type { ChecklistItem } from "@/types/visit";
import { JobDetail } from "@/components/tech/JobDetail";

type Props = { params: Promise<{ id: string }> };

// ─── Fallback checklist for categories without a template ─────────────────────

const FALLBACK_ITEMS = [
  "Assess job site and document current conditions",
  "Complete all assigned work per job description",
  "Test all affected equipment after work",
  "Clean up work area",
  "Note any follow-up items or concerns",
  "Take before/after photos",
];

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const wo = MOCK_WORK_ORDERS.find((w) => w.id === id);
  return { title: wo ? `${wo.wo_number} — Job Detail` : "Job Not Found" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TechJobDetailPage({ params }: Props) {
  const { id } = await params;

  const wo = MOCK_WORK_ORDERS.find((w) => w.id === id);
  if (!wo) notFound();

  const property = MOCK_PROPERTIES.find((p) => p.id === wo.property_id);

  const template = checklistTemplates.find(
    (t) => t.serviceCategory === wo.service_category
  );
  const items = template?.items ?? FALLBACK_ITEMS;

  const initialChecklist: ChecklistItem[] = items.map((label, i) => ({
    id:        `item-${i}`,
    label,
    completed: false,
  }));

  // Idempotent — returns the same visit if already created for this WO.
  const visit = getOrCreateVisit(
    wo.id,
    wo.property_id,
    wo.assigned_technician_id,
    initialChecklist
  );

  return (
    <JobDetail
      wo={wo}
      property={property}
      initialChecklist={visit.checklist}
      visitId={visit.id}
    />
  );
}
