import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getEstimateById, getEstimateLines } from "@/lib/db/queries/estimates";
import { toPublicEstimate } from "@/lib/estimates/public-serializer";
import { buildEstimatePdf } from "@/lib/estimates/pdf";
import { db } from "@/lib/db/client";

// GET /api/estimates/[id]/pdf — proposal PDF from the current/redacted view.
// Driven by the PUBLIC serialization so no internal cost/notes can appear.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const estimate = await getEstimateById(id, tenantId);
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

    const lines = await getEstimateLines(id, tenantId);
    const { data: tenantRow } = await db
      .from("tenants")
      .select("name, logo_url, business_phone, business_email")
      .eq("id", tenantId)
      .maybeSingle();
    const t = (tenantRow ?? {}) as { name?: string; logo_url?: string | null; business_phone?: string | null; business_email?: string | null };

    const view = toPublicEstimate(estimate, lines, {
      company_name: t.name ?? "ServiceOps",
      company_logo_url: t.logo_url ?? null,
      company_phone: t.business_phone ?? null,
      company_email: t.business_email ?? null,
    });

    const pdf = await buildEstimatePdf(view);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${estimate.estimate_number}-proposal.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api] GET /api/estimates/[id]/pdf:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
