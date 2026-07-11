import type { Metadata } from "next";
import { NewEstimateClient } from "./NewEstimateClient";

export const metadata: Metadata = { title: "New Estimate" };

export default function NewEstimatePage() {
  return <NewEstimateClient />;
}
