import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getSession } from "./index";
import { UserRole } from "@/types/technician";
import { rolePermissions, type RolePermissions } from "@/config/roles";
import { resolveTrustedContext, type TrustedContext } from "./trusted-context";
import { isSameOriginRequest } from "@/lib/security/origin";
import { newRequestId } from "@/lib/security/request-id";
import { logger } from "@/lib/security/logger";

export { getTenantId } from "./tenant";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ApiAuthOk   = { ok: true;  session: Session; context: TrustedContext };
export type ApiAuthFail = { ok: false; response: NextResponse };
export type ApiAuthResult = ApiAuthOk | ApiAuthFail;

// ---------------------------------------------------------------------------
// Response factories (new instance each call — avoids stream-reuse issues)
// ---------------------------------------------------------------------------

function unauthResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized — sign in to continue" },
    { status: 401 }
  );
}

function forbiddenResponse(msg = "Forbidden — insufficient permissions"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 });
}

function crossOriginResponse(): NextResponse {
  return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Requires a valid session AND re-validates it against the database on every
 * call — the trusted authorization context (security-audit H2). A session
 * whose user has been deactivated, had their role changed, or had their
 * password changed since the JWT was issued is rejected immediately rather
 * than remaining valid for the rest of its 8h maxAge.
 *
 * `session.user.tenant_id`/`role`/`technician_id` are overwritten with the
 * fresh DB values before being returned, so every existing call site
 * (`getTenantId(session)`, `session.user.role`, etc.) is automatically
 * authorized against current data with no call-site changes required.
 *
 * Usage:
 *   const auth = await requireApiAuth();
 *   if (!auth.ok) return auth.response;
 *   const { session, context } = auth;
 */
export async function requireApiAuth(): Promise<ApiAuthResult> {
  if (!(await isSameOriginRequest())) {
    logger.warn("[auth] cross-origin request rejected");
    return { ok: false, response: crossOriginResponse() };
  }

  const session = await getSession();
  if (!session) return { ok: false, response: unauthResponse() };

  const requestId = newRequestId();
  const trusted = await resolveTrustedContext(session, requestId);
  if (!trusted.ok) {
    // Same generic message whether the account was deactivated, the role
    // changed, or the session was never valid — don't leak which.
    return { ok: false, response: unauthResponse() };
  }

  session.user.tenant_id = trusted.context.tenantId;
  session.user.role = trusted.context.role;
  session.user.technician_id = trusted.context.technicianId;

  return { ok: true, session, context: trusted.context };
}

/**
 * Requires a valid session AND the user's role to be in `allowedRoles`.
 * Returns `{ ok: false, response: 403 }` when the role check fails.
 */
export async function requireApiRole(...allowedRoles: UserRole[]): Promise<ApiAuthResult> {
  const result = await requireApiAuth();
  if (!result.ok) return result;
  if (!allowedRoles.includes(result.session.user.role as UserRole)) {
    return { ok: false, response: forbiddenResponse() };
  }
  return result;
}

/**
 * Requires a valid session AND a specific RolePermissions flag to be `true`.
 * Derives the check from `rolePermissions[role][permission]`.
 *
 * Example: requirePermission("canViewReports") blocks TECHNICIAN + OFFICE_STAFF.
 */
export async function requirePermission(
  permission: keyof RolePermissions
): Promise<ApiAuthResult> {
  const result = await requireApiAuth();
  if (!result.ok) return result;

  const role = result.session.user.role as UserRole;
  const allowed = rolePermissions[role]?.[permission] ?? false;

  if (!allowed) {
    return {
      ok: false,
      response: forbiddenResponse(
        `Forbidden — your role does not have the '${permission}' permission`
      ),
    };
  }

  return result;
}

/**
 * Returns true when the session user is a TECHNICIAN who can only see their
 * own assigned jobs. Use this to decide whether to scope a query.
 */
export function isTechnicianScoped(session: Session): boolean {
  return (session.user.role as UserRole) === UserRole.TECHNICIAN;
}
