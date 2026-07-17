import type { Metadata } from "next";
import { FinancialReportClient } from "@/components/dashboard/FinancialReportClient";

export const metadata: Metadata = { title: "Financial Report" };

export default function FinancialReportPage() {
  return <FinancialReportClient />;
}
