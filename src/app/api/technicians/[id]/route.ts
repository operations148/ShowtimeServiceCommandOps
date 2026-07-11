import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiAuth, requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";
import { PatchTechnicianSchema } from "@/lib/validation/technician";
import { bumpSessionVersion } from "@/lib/auth/trusted-context";
import { recordAuditEvent } from "@/lib/security/audit";
import { checkPasswordStrength } from "@/lib/security/password-policy";

// ---------------------------------------------------------------------------
// GET /api/technicians/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const { data, error } = await db
    .from("users")
    .select("id, name, email, phone, is_active, created_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("role", "technician")
    .maybeSingle();

  if (error) {
    console.error("[api] GET /api/technicians/[id] error:", error.message);
    return NextResponse.json({ error: "Failed to fetch technician" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Technician not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

// ---------------------------------------------------------------------------
// PATCH /api/technicians/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canAssignTechnicians");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = PatchTechnicianSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, email, phone, is_active, new_password } = result.data;

  // Verify technician belongs to this tenant
  const { data: existing } = await db
    .from("users")
    .select("id, email, is_active")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("role", "technician")
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Technician not found" }, { status: 404 });
  }

  if (new_password) {
    const strength = checkPasswordStrength(new_password);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.reason }, { status: 422 });
    }
  }

  // If email is changing, check for duplicates
  if (email && email !== existing.email) {
    const { data: conflict } = await db
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();

    if (conflict) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }
  }

  // Build update payload
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone ?? null;
  if (is_active !== undefined) updates.is_active = is_active;
  if (new_password) updates.password_hash = await bcrypt.hash(new_password, 12);

  const { data: updated, error: updateError } = await db
    .from("users")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, name, email, phone, is_active, created_at")
    .single();

  if (updateError) {
    console.error("[api] PATCH /api/technicians/[id] error:", updateError.message);
    return NextResponse.json({ error: "Failed to update technician" }, { status: 500 });
  }

  if (is_active !== undefined || new_password) {
    await bumpSessionVersion(id, tenantId);
  }

  if (is_active !== undefined && is_active !== existing.is_active) {
    void recordAuditEvent({
      tenantId, userId: auth.session.user.id,
      actionType: is_active ? "user.reactivated" : "user.deactivated",
      description: is_active ? "Reactivated technician" : "Deactivated technician",
      entityType: "user", entityId: id,
    });
  }
  if (new_password) {
    void recordAuditEvent({
      tenantId, userId: auth.session.user.id, actionType: "password.admin_reset",
      description: "Admin reset technician password",
      entityType: "user", entityId: id,
    });
  }

  return NextResponse.json({ data: updated });
}
