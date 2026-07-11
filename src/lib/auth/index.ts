import { getServerSession as nextAuthGetServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./config";
import { UserRole } from "@/types/technician";
import { resolveTrustedContext } from "./trusted-context";
import { newRequestId } from "@/lib/security/request-id";

export { UserRole };
export { getTenantId } from "./tenant";

export async function getSession() {
  return nextAuthGetServerSession(authOptions);
}

/**
 * Redirects to /login if unauthenticated, deactivated, or revoked (role
 * change/deactivation/password change since the JWT was issued — see
 * src/lib/auth/trusted-context.ts). Returns the session with tenant_id/role
 * refreshed from the database.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) redirect("/login");

  const trusted = await resolveTrustedContext(session, newRequestId());
  if (!trusted.ok) redirect("/login");

  session.user.tenant_id = trusted.context.tenantId;
  session.user.role = trusted.context.role;
  session.user.technician_id = trusted.context.technicianId;

  return session;
}

/** Redirects to /login if unauthenticated or role doesn't match. */
export async function requireRole(role: UserRole) {
  const session = await requireAuth();
  if (session.user.role !== role) redirect("/dashboard/overview");
  return session;
}
