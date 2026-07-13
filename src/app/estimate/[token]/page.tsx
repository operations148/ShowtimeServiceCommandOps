import type { Metadata } from "next";
import { PublicEstimateClient } from "./PublicEstimateClient";

export const metadata: Metadata = {
  title: "Your Estimate",
  robots: { index: false, follow: false }, // never index customer estimate links
};

export default async function PublicEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicEstimateClient token={token} />;
}
