/**
 * Trusted server-side authorization context (security-audit H2 -- deactivating
 * a user or changing their role previously had no effect until the JWT's 8h
 * maxAge naturally expired, because every check trusted the JWT's claims
 * as-issued).
 *
 * Every authenticated request re-fetches the user's current tenant_id/role/
 * is_active/session_version from the database and compares session_version
 * against the value the JWT was issued with. A mismatch (role changed,
 * deactivated, or password changed since login -- all of which bump
 * session_version) invalidates the session immediately, without waiting for
 * the token to expire naturally.
 */

import { db } from "@/lib/db/client";
import type { Session } from "next-auth";
import { UserRole } from "@/types/technician";

export interface TrustedContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  technicianId?: string;
  requestId: string;
}

export type TrustedContextResult =
  | { ok: true; context: TrustedContext }
  | { ok: false; reason: "unauthenticated" | "revoked" };

interface TrustedUserRow {
  id: string;
  tenant_id: string;
  role: UserRole;
  is_active: boolean;
  session_version: number;
}

export async function resolveTrustedContext(
  session: Session | null,
  requestId: string
): Promise<TrustedContextResult> {
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" };

  const tokenSessionVersion =
    (session.user as { session_version?: number }).session_version ?? 1;

  const { data, error } = await db
    .from("users")
    .select("id, tenant_id, role, is_active, session_version")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "revoked" };

  const row = data as unknown as TrustedUserRow;
  if (!row.is_active) return { ok: false, reason: "revoked" };
  if (row.session_version !== tokenSessionVersion) return { ok: false, reason: "revoked" };

  return {
    ok: true,
    context: {
      userId: row.id,
      tenantId: row.tenant_id,
      role: row.role,
      technicianId: row.role === UserRole.TECHNICIAN ? row.id : undefined,
      requestId,
    },
  };
}

/** Bumps session_version, invalidating every JWT issued before the call. Never fatal to the caller's own action if the bump itself fails to write. */
export async function bumpSessionVersion(userId: string, tenantId: string): Promise<void> {
  const { error } = await db.rpc("increment_session_version", { p_user_id: userId, p_tenant_id: tenantId });
  if (error) {
    // Fallback for environments where the RPC hasn't been created yet --
    // still correct, just not atomic against a concurrent bump.
    const { data } = await db
      .from("users")
      .select("session_version")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const current = (data as { session_version?: number } | null)?.session_version ?? 1;
    await db
      .from("users")
      .update({ session_version: current + 1 })
      .eq("id", userId)
      .eq("tenant_id", tenantId);
  }
}
