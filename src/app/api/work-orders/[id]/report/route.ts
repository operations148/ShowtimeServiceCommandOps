import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, getTenantId } from "@/lib/auth/api-auth";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { listVisits } from "@/lib/db/queries/visits";
import { getSignedPhotos } from "@/lib/storage/photos";
import { generateCompletionReportPdf } from "@/lib/reports/completion-report";
import { db } from "@/lib/db/client";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]/report
//
// Returns a PDF job completion report for the given work order.
// Auth-gated; any signed-in user (admin/office/read-only) may download.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  // Fetch work order
  let workOrder;
  try {
    workOrder = await getWorkOrderById(id, tenantId);
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/report WO fetch failed:", err);
    return NextResponse.json({ error: "Failed to load work order" }, { status: 500 });
  }
  if (!workOrder) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  // Fetch most recent completed (or any) visit
  let visit = null;
  try {
    const visits = await listVisits({ work_order_id: id, tenant_id: tenantId });
    // Prefer completed visit; fall back to the most recent
    visit = visits.find((v) => v.status === "completed") ?? visits[0] ?? null;
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/report visits fetch failed:", err);
    // Non-fatal — continue without visit data
  }

  // Fetch signed photo URLs (max 6)
  let photos: import("@/lib/storage/photos").SignedPhoto[] = [];
  if (visit && visit.photo_urls.length > 0) {
    try {
      photos = await getSignedPhotos(visit.photo_urls.slice(0, 6));
    } catch (err) {
      console.error("[api] GET /api/work-orders/[id]/report photos fetch failed:", err);
      // Non-fatal
    }
  }

  // Get company name from tenant
  let companyName = "ServiceOps";
  try {
    const { data: tenant } = await db
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenant?.name) companyName = tenant.name;
  } catch {
    // Non-fatal — use default
  }

  // Generate PDF
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateCompletionReportPdf({ workOrder, visit, photos, companyName });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[api] GET /api/work-orders/[id]/report PDF generation failed:", message);
    if (stack) console.error("[api] PDF stack trace:", stack);
    console.error("[api] PDF context — WO:", id, "visit:", visit?.id ?? "none", "photos:", photos.length, "company:", companyName);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }

  const filename = `${workOrder.wo_number}-completion-report.pdf`;

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.length),
      "Cache-Control":       "no-store",
    },
  });
}
