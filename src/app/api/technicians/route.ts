import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiAuth, requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";
import { CreateTechnicianSchema } from "@/lib/validation/technician";

// ---------------------------------------------------------------------------
// GET /api/technicians
// Returns all active technicians for the current tenant.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const includeAll = request.nextUrl.searchParams.get("all") === "true";

  let data, error;
  try {
    let query = db
      .from("users")
      .select("id, name, email, phone, is_active")
      .eq("tenant_id", tenantId)
      .eq("role", "technician")
      .order("name", { ascending: true });

    if (!includeAll) query = query.eq("is_active", true);

    ({ data, error } = await query);
  } catch (err) {
    console.error("[api] GET /api/technicians failed:", err);
    return NextResponse.json({ data: [] });
  }

  if (error) {
    console.error("[api] GET /api/technicians DB error:", error.message);
    return NextResponse.json({ data: [] });
  }

  return NextResponse.json({ data: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/technicians
// Creates a new technician user for the current tenant.
// Requires canAssignTechnicians permission (tenant_admin + office_staff).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requirePermission("canAssignTechnicians");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = CreateTechnicianSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, email, phone, password } = result.data;

  // Check for duplicate email within tenant
  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists in your account." },
      { status: 409 }
    );
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { data: newUser, error: insertError } = await db
    .from("users")
    .insert({
      tenant_id: tenantId,
      name,
      email,
      phone: phone ?? null,
      password_hash,
      role: "technician",
      is_active: true,
    })
    .select("id, name, email, phone, role, is_active, created_at")
    .single();

  if (insertError) {
    console.error("[api] POST /api/technicians insert error:", insertError.message);
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create technician" }, { status: 500 });
  }

  return NextResponse.json({ data: newUser }, { status: 201 });
}
