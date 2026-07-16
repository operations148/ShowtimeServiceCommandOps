import type { Metadata } from "next";
import { PortalUsersPageClient } from "@/components/dashboard/PortalUsersPageClient";

export const metadata: Metadata = { title: "Portal Users" };

export default function PortalUsersPage() {
  return <PortalUsersPageClient />;
}
