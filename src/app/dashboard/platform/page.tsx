import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/config";
import { rolePermissions } from "@/config/roles";
import { UserRole } from "@/types/technician";
import { isPlatformAdminEnabled } from "@/lib/platform/flags";
import { PlatformAdminClient } from "@/components/dashboard/PlatformAdminClient";

export const metadata: Metadata = { title: "Platform Admin" };

// Server-gated: when the kill-switch is off OR the caller isn't a platform
// owner, this route 404s — the cross-tenant surface shouldn't even acknowledge
// it exists. The API routes enforce the same, independently.
export default async function PlatformAdminPage() {
  if (!isPlatformAdminEnabled()) notFound();

  const session = await getServerSession(authOptions);
  const role = session?.user?.role as UserRole | undefined;
  if (!role || !rolePermissions[role].canManageTenants) notFound();

  return <PlatformAdminClient />;
}
