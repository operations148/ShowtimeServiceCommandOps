import type { Metadata } from "next";
import { EstimateDetailClient } from "./EstimateDetailClient";

export const metadata: Metadata = { title: "Estimate" };

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EstimateDetailClient id={id} />;
}
