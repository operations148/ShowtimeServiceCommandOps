import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { listVisits } from "@/lib/db/queries/visits";
import { WorkOrderDetail } from "@/components/dashboard/WorkOrderDetail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as Record<string, string> | undefined)?.tenant_id;
  try {
    const wo = await getWorkOrderById(id, tenantId);
    if (!wo) return { title: "Work Order Not Found" };
    return { title: `${wo.wo_number} – ${wo.title}` };
  } catch {
    return { title: "Work Order" };
  }
}

export default async function WorkOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as Record<string, string> | undefined)?.tenant_id;

  // No tenant on the session means no authorized context to scope this query
  // to — never fall back to a default tenant (security-audit M2 precedent).
  if (!tenantId) notFound();

  let workOrder;
  try {
    workOrder = await getWorkOrderById(id, tenantId);
  } catch (err) {
    console.error("[page] WorkOrderDetailPage failed:", err);
    notFound();
  }

  if (!workOrder) notFound();

  // Find the most recent active or completed visit so the admin can see photos
  let visitId: string | undefined;
  try {
    const visits = await listVisits({ tenant_id: tenantId, work_order_id: id });
    visitId = visits[0]?.id;
  } catch {
    // Non-fatal — page still renders without photos
  }

  return <WorkOrderDetail workOrder={workOrder} visitId={visitId} />;
}
