import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string;
  owner_name: string | null;
  business_phone: string | null;
  business_email: string | null;
  service_area: string | null;
  logo_url: string | null;
  ghl_location_id: string | null;
  last_webhook_at: string | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UpdateCompanySchema = z.object({
  name:           z.string().min(2, "Company name must be at least 2 characters").max(120).transform(v => v.trim()).optional(),
  owner_name:     z.string().max(120).transform(v => v.trim()).optional(),
  business_phone: z.string().max(40).transform(v => v.trim()).optional(),
  business_email: z.string().email("Enter a valid email").transform(v => v.toLowerCase().trim()).optional().or(z.literal("")),
  service_area:   z.string().max(200).transform(v => v.trim()).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/settings/company
// ---------------------------------------------------------------------------

export async function GET() {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { data, error } = await db
    .from("tenants")
    .select("id, name, slug, owner_name, business_phone, business_email, service_area, logo_url, ghl_location_id, last_webhook_at")
    .eq("id", tenantId)
    .single();

  if (error) {
    console.error("[api] GET /api/settings/company failed:", error);
    return NextResponse.json({ error: "Failed to load company profile" }, { status: 500 });
  }

  return NextResponse.json({ data: data as CompanyProfile });
}

// ---------------------------------------------------------------------------
// PATCH /api/settings/company
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = UpdateCompanySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  if (Object.keys(result.data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await db
    .from("tenants")
    .update(result.data)
    .eq("id", tenantId)
    .select("id, name, slug, owner_name, business_phone, business_email, service_area, logo_url, ghl_location_id, last_webhook_at")
    .single();

  if (error) {
    console.error("[api] PATCH /api/settings/company failed:", error);
    return NextResponse.json({ error: "Failed to save company profile" }, { status: 500 });
  }

  return NextResponse.json({ data: data as CompanyProfile });
}
