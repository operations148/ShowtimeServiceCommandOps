import type { Metadata } from "next";
import { PublicChangeOrderClient } from "./PublicChangeOrderClient";

export const metadata: Metadata = {
  title: "Your Change Order",
  robots: { index: false, follow: false }, // never index customer change-order links
};

export default async function PublicChangeOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicChangeOrderClient token={token} />;
}
