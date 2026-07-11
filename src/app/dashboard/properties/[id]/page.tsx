import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getPropertyById } from "@/lib/db/queries/properties";
import { listWorkOrders } from "@/lib/db/queries/work-orders";
import { PropertyDetail } from "@/components/dashboard/PropertyDetail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as Record<string, string> | undefined)?.tenant_id;
  try {
    const property = await getPropertyById(id, tenantId);
    return { title: property ? `${property.customer_name} — Property` : "Property Not Found" };
  } catch {
    return { title: "Property" };
  }
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as Record<string, string> | undefined)?.tenant_id;

  // No tenant on the session means no authorized context to scope this query
  // to — never fall back to a default tenant (security-audit M2 precedent).
  if (!tenantId) notFound();

  let property, relatedWorkOrders;
  try {
    [property, relatedWorkOrders] = await Promise.all([
      getPropertyById(id, tenantId),
      listWorkOrders({ tenant_id: tenantId, property_id: id }),
    ]);
  } catch (err) {
    console.error("[page] PropertyDetailPage failed:", err);
    notFound();
  }

  if (!property) notFound();

  return <PropertyDetail property={property} relatedWorkOrders={relatedWorkOrders ?? []} />;
}
