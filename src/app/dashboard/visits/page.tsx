import type { Metadata } from "next";
import { VisitsAdminClient } from "@/components/dashboard/VisitsAdminClient";

export const metadata: Metadata = { title: "Visits" };

export default function VisitsPage() {
  return <VisitsAdminClient />;
}
