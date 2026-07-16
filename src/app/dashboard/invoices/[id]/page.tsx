import type { Metadata } from "next";
import { InvoiceDetailClient } from "./InvoiceDetailClient";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetailClient id={id} />;
}
