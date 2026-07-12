import type { Metadata } from "next";
import { NewChangeOrderClient } from "./NewChangeOrderClient";

export const metadata: Metadata = { title: "New Change Order" };

export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NewChangeOrderClient workOrderId={id} />;
}
