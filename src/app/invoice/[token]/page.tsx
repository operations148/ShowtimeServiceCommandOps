import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicInvoiceClient } from "./PublicInvoiceClient";

export const metadata: Metadata = {
  title: "Your Invoice",
  robots: { index: false, follow: false }, // never index customer invoice links
};

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense fallback={null}>
      <PublicInvoiceClient token={token} />
    </Suspense>
  );
}
