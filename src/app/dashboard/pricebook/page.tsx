import type { Metadata } from "next";
import { PricebookPageClient } from "@/components/dashboard/PricebookPageClient";

export const metadata: Metadata = { title: "Pricebook" };

export default function PricebookPage() {
  return <PricebookPageClient />;
}
