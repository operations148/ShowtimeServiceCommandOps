import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, getTenantId } from "@/lib/auth/api-auth";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { listVisits } from "@/lib/db/queries/visits";
import { db } from "@/lib/db/client";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]/report
//
// Returns an HTML completion report. Users open it in the browser and use
// browser print → Save as PDF. Replaced @react-pdf/renderer which failed
// on Vercel due to ESM/CJS interop issues with the Next.js bundler.
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
    console.error("[report] WO fetch failed:", err);
    return NextResponse.json({ error: "Failed to load work order" }, { status: 500 });
  }
  if (!workOrder) {
    return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
  }

  // Fetch visits (non-fatal)
  let visits: Awaited<ReturnType<typeof listVisits>> = [];
  try {
    visits = await listVisits({ work_order_id: id, tenant_id: tenantId });
  } catch (err) {
    console.error("[report] visits fetch failed:", err);
  }

  // Fetch tenant name (non-fatal)
  let companyName = "ServiceOps";
  try {
    const { data: tenant } = await db
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenant?.name) companyName = tenant.name;
  } catch {
    // use default
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const formatDate = (d: string | null | undefined) => {
    if (!d) return "N/A";
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const statusColors: Record<string, string> = {
    new:              "#3B82F6",
    assigned:         "#8B5CF6",
    in_progress:      "#F59E0B",
    completed:        "#10B981",
    estimate_needed:  "#F59E0B",
    cancelled:        "#6B7280",
  };
  const statusColor = statusColors[workOrder.status] ?? "#6B7280";

  // -------------------------------------------------------------------------
  // Visit / checklist HTML
  // -------------------------------------------------------------------------
  const checklistHtml = visits.length > 0
    ? visits.map((visit) => {
        const items = Array.isArray(visit.checklist) ? visit.checklist : [];
        const completed = items.filter((i) => i.completed).length;
        return `
          <div class="visit-block">
            <div class="visit-header">
              <span>Visit — ${formatDate(visit.scheduled_date)}</span>
              <span class="visit-status">${visit.status}</span>
            </div>
            ${items.length > 0 ? `
              <div class="checklist-progress">${completed} of ${items.length} items completed</div>
              <ul class="checklist">
                ${items.map((item) => `
                  <li class="${item.completed ? "done" : "pending"}">
                    <span class="check-icon">${item.completed ? "✓" : "○"}</span>
                    ${item.label ?? ""}
                  </li>
                `).join("")}
              </ul>
            ` : "<p class=\"no-items\">No checklist items</p>"}
            ${visit.technician_notes ? `
              <div class="notes-block">
                <strong>Technician Notes</strong>
                <p>${visit.technician_notes}</p>
              </div>
            ` : ""}
          </div>
        `;
      }).join("")
    : "<p class=\"no-data\">No visits recorded for this work order.</p>";

  // -------------------------------------------------------------------------
  // Property section
  // -------------------------------------------------------------------------
  const hasProperty = !!workOrder.property_customer_name || !!workOrder.property_address;
  const propertyHtml = hasProperty ? `
    <div class="section">
      <div class="section-label">Property</div>
      <div class="info-grid">
        <div class="info-item">
          <label>Customer</label>
          <value>${workOrder.property_customer_name ?? "N/A"}</value>
        </div>
        <div class="info-item">
          <label>Address</label>
          <value>${workOrder.property_address ?? "N/A"}</value>
        </div>
      </div>
    </div>
  ` : "";

  // -------------------------------------------------------------------------
  // Full HTML document
  // -------------------------------------------------------------------------
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Work Order Report — ${workOrder.wo_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      color: #1e293b;
      background: white;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
    .print-btn {
      display: block;
      margin: 0 auto 32px;
      padding: 10px 24px;
      background: #06B6D4;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #E2E8F0;
    }
    .company-name { font-size: 22px; font-weight: 700; color: #0F172A; }
    .report-title { font-size: 12px; color: #64748B; margin-top: 4px; font-family: monospace; letter-spacing: 0.06em; text-transform: uppercase; }
    .wo-badge { text-align: right; }
    .wo-number { font-family: monospace; font-size: 18px; font-weight: 700; color: #06B6D4; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; font-family: monospace; letter-spacing: 0.06em; text-transform: uppercase; color: white; background: ${statusColor}; margin-top: 4px; }
    .job-title { font-size: 24px; font-weight: 700; color: #0F172A; margin-bottom: 6px; }
    .job-subtitle { font-size: 14px; color: #64748B; margin-bottom: 28px; }
    .section { margin-bottom: 28px; }
    .section-label { font-family: monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #94A3B8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #F1F5F9; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .info-item label { display: block; font-size: 11px; color: #94A3B8; margin-bottom: 3px; font-family: monospace; text-transform: uppercase; letter-spacing: 0.05em; }
    .info-item value { display: block; font-size: 14px; font-weight: 500; color: #1E293B; }
    .visit-block { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .visit-header { font-weight: 600; color: #0F172A; margin-bottom: 8px; display: flex; justify-content: space-between; }
    .visit-status { font-family: monospace; font-size: 11px; color: #64748B; text-transform: uppercase; }
    .checklist-progress { font-size: 12px; color: #64748B; margin-bottom: 10px; font-family: monospace; }
    .checklist { list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .checklist li { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; }
    .checklist li.done { color: #374151; }
    .checklist li.pending { color: #94A3B8; }
    .check-icon { width: 18px; height: 18px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    li.done .check-icon { background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; }
    li.pending .check-icon { background: #F8FAFC; color: #CBD5E1; border: 1px solid #E2E8F0; }
    .notes-block { margin-top: 12px; padding: 10px 12px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; font-size: 13px; }
    .notes-block strong { display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #92400E; font-family: monospace; }
    .notes-block p { color: #78350F; line-height: 1.5; }
    .no-data { color: #94A3B8; font-style: italic; font-size: 13px; padding: 12px 0; }
    .no-items { color: #94A3B8; font-size: 12px; padding: 6px 0; }
    .report-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; font-size: 11px; color: #94A3B8; font-family: monospace; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>

  <div class="report-header">
    <div>
      <div class="company-name">${companyName}</div>
      <div class="report-title">Work Order Completion Report</div>
    </div>
    <div class="wo-badge">
      <div class="wo-number">${workOrder.wo_number}</div>
      <div><span class="status-badge">${workOrder.status.replace(/_/g, " ")}</span></div>
    </div>
  </div>

  <div class="job-title">${workOrder.title ?? "Untitled Work Order"}</div>
  <div class="job-subtitle">${
    hasProperty
      ? `${workOrder.property_customer_name ?? ""} · ${workOrder.property_address ?? ""}`
      : "Property not linked"
  }</div>

  <div class="section">
    <div class="section-label">Job Information</div>
    <div class="info-grid">
      <div class="info-item">
        <label>Service Category</label>
        <value>${(workOrder.service_category ?? "N/A").replace(/_/g, " ")}</value>
      </div>
      <div class="info-item">
        <label>Priority</label>
        <value>${workOrder.priority ?? "N/A"}</value>
      </div>
      <div class="info-item">
        <label>Scheduled Date</label>
        <value>${formatDate(workOrder.scheduled_date)}</value>
      </div>
      <div class="info-item">
        <label>Completed Date</label>
        <value>${formatDate(workOrder.completed_at)}</value>
      </div>
      <div class="info-item">
        <label>Created</label>
        <value>${formatDate(workOrder.created_at)}</value>
      </div>
    </div>
  </div>

  ${workOrder.description ? `
  <div class="section">
    <div class="section-label">Description</div>
    <div class="info-item"><value>${workOrder.description}</value></div>
  </div>
  ` : ""}

  ${propertyHtml}

  <div class="section">
    <div class="section-label">Visit Records &amp; Checklists</div>
    ${checklistHtml}
  </div>

  <div class="report-footer">
    <span>Generated by ${companyName} via ServiceOps</span>
    <span>${new Date().toLocaleString("en-US")}</span>
    <span>${workOrder.wo_number}</span>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type":        "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${workOrder.wo_number}-report.html"`,
      "Cache-Control":       "no-store",
    },
  });
}
