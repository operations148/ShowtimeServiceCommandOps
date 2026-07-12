import type { Metadata } from "next";
import { ChangeOrderDetailClient } from "./ChangeOrderDetailClient";

export const metadata: Metadata = { title: "Change Order" };

export default async function ChangeOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChangeOrderDetailClient id={id} />;
}
