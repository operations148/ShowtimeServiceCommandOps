import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listCompletionRules, setCompletionRule } from "@/lib/db/queries/completion-requirements";
import { SetCompletionRuleSchema } from "@/lib/validation/completion-requirements";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/settings/completion-requirements — all configured rules for the tenant.
export async function GET(_request: NextRequest) {
  const auth = await requirePermission("canViewAllWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  try {
    return NextResponse.json({ data: await listCompletionRules(tenantId) });
  } catch (err) {
    console.error("[api] GET /api/settings/completion-requirements:", err);
    return NextResponse.json({ error: "Failed to load completion requirements" }, { status: 500 });
  }
}

// PUT /api/settings/completion-requirements — upsert the rule for a category
// (or the tenant default when service_category is omitted/null).
export async function PUT(request: NextRequest) {
  const auth = await requirePermission("canManageCompletionRequirements");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SetCompletionRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const rule = await setCompletionRule(parsed.data, tenantId);

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "completion_requirement_rule.updated",
      description: `Updated completion requirements for ${parsed.data.service_category ?? "all categories (default)"}`,
      entityType: "completion_requirement_rule",
      entityId: rule.id,
    });

    return NextResponse.json({ data: rule });
  } catch (err) {
    console.error("[api] PUT /api/settings/completion-requirements:", err);
    return NextResponse.json({ error: "Failed to update completion requirements" }, { status: 500 });
  }
}
