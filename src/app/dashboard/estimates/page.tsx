import type { Metadata } from "next";
import { EstimatesWorkspace } from "@/components/dashboard/EstimatesWorkspace";

export const metadata: Metadata = { title: "Estimates" };

export default function EstimatesPage() {
  return <EstimatesWorkspace />;
}
