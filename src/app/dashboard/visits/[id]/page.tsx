import type { Metadata } from "next";
import { VisitAdminDetailClient } from "@/components/dashboard/VisitAdminDetailClient";

export const metadata: Metadata = { title: "Visit" };

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisitAdminDetailClient id={id} />;
}
