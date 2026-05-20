import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/config";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { getOrCreateVisit } from "@/lib/db/queries/visits";
import { checklistTemplates } from "@/config/checklist-templates";
import type { ChecklistItem } from "@/types/visit";
import { JobDetail } from "@/components/tech/JobDetail";

type Props = { params: Promise<{ id: string }> };

const FALLBACK_ITEMS = [
  "Assess job site and document current conditions",
  "Complete all assigned work per job description",
  "Test all affected equipment after work",
  "Clean up work area",
  "Note any follow-up items or concerns",
  "Take before/after photos",
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const tenantId = session?.user.tenant_id ?? "tenant-showtime";
  const wo = await getWorkOrderById(id, tenantId);
  return { title: wo ? `${wo.wo_number} — Job Detail` : "Job Not Found" };
}

export default async function TechJobDetailPage({ params }: Props) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  const tenantId = session?.user.tenant_id ?? "tenant-showtime";

  const wo = await getWorkOrderById(id, tenantId);
  if (!wo) notFound();

  const template = checklistTemplates.find(
    (t) => t.serviceCategory === wo.service_category
  );
  const items = template?.items ?? FALLBACK_ITEMS;

  const initialChecklist: ChecklistItem[] = items.map((label, i) => ({
    id:        `item-${i}`,
    label,
    completed: false,
  }));

  const visit = await getOrCreateVisit(
    wo.id,
    wo.property_id,
    session?.user.technician_id ?? wo.assigned_technician_id,
    initialChecklist,
    tenantId
  );

  return (
    <JobDetail
      wo={wo}
      property={undefined}
      initialChecklist={visit.checklist}
      visitId={visit.id}
      initialPhotoPaths={visit.photo_urls}
      technicianName={session?.user?.name ?? undefined}
    />
  );
}
