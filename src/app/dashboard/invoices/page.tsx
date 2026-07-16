import type { Metadata } from "next";
import { InvoicesPageClient } from "@/components/dashboard/InvoicesPageClient";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <InvoicesPageClient />;
}
