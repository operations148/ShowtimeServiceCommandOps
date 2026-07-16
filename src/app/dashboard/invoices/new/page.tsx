import type { Metadata } from "next";
import { NewInvoiceClient } from "./NewInvoiceClient";

export const metadata: Metadata = { title: "New Invoice" };

export default function NewInvoicePage() {
  return <NewInvoiceClient />;
}
