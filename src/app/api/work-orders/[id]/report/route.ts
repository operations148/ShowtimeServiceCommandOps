import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getWorkOrderById } from "@/lib/db/queries/work-orders";
import { listVisits } from "@/lib/db/queries/visits";
import { listChangeOrders } from "@/lib/db/queries/change-orders";
import { ChangeOrderStatus } from "@/types/change-order";
import { db } from "@/lib/db/client";
import { pdfText } from "@/lib/pdf/pdf-text";
import { formatCents } from "@/lib/money/money";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import PDFDocument from "pdfkit";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/work-orders/[id]/report
//
// Server-side PDF generation using pdfkit (Node.js native CJS).
// Returns binary PDF directly — no browser rendering required.
// pdfkit is listed in serverExternalPackages so webpack does not bundle it,
// preserving its internal require() calls for built-in font data.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    // Completion reports carry contract/financial detail — same gate as the
    // admin work-order detail page that links to this route (defense-in-depth:
    // don't rely solely on which UI page happens to render the download link).
    const auth = await requirePermission("canViewAllWorkOrders");
    if (!auth.ok) return auth.response;
    const tenantId = getTenantId(auth.session);
    const role = auth.session.user.role as UserRole;
    const canViewFinancials = rolePermissions[role]?.canViewFinancialReports ?? false;

    const { id } = await params;

    // Fetch work order (already has joined property_customer_name / property_address)
    const workOrder = await getWorkOrderById(id, tenantId);
    if (!workOrder) {
      return NextResponse.json({ error: `Work order "${id}" not found` }, { status: 404 });
    }

    // Fetch visits (non-fatal)
    let visits: Awaited<ReturnType<typeof listVisits>> = [];
    try {
      visits = await listVisits({ work_order_id: id, tenant_id: tenantId });
    } catch (err) {
      console.error("[report] visits fetch:", err);
    }

    // Fetch approved change orders for this work order (non-fatal)
    let acceptedChangeOrders: Awaited<ReturnType<typeof listChangeOrders>> = [];
    try {
      acceptedChangeOrders = await listChangeOrders(tenantId, {
        q: undefined,
        work_order_id: id,
        status: ChangeOrderStatus.ACCEPTED,
      });
    } catch (err) {
      console.error("[report] change orders fetch:", err);
    }

    // Fetch tenant branding (non-fatal)
    let companyName = "ServiceOps";
    let companyPhone: string | null = null;
    let companyEmail: string | null = null;
    try {
      const { data: tenant } = await db
        .from("tenants")
        .select("name, business_phone, business_email")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenant?.name) companyName = tenant.name;
      companyPhone = (tenant as { business_phone?: string | null } | null)?.business_phone ?? null;
      companyEmail = (tenant as { business_email?: string | null } | null)?.business_email ?? null;
    } catch { /* use default */ }

    // Fetch property access notes if property is linked (non-fatal)
    let accessNotes: string | null = null;
    if (workOrder.property_id) {
      try {
        const { data: prop } = await db
          .from("properties")
          .select("access_notes")
          .eq("id", workOrder.property_id)
          .maybeSingle();
        accessNotes = prop?.access_notes ?? null;
      } catch { /* non-fatal */ }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    const fmtDate = (d: string | null | undefined) => {
      if (!d) return "N/A";
      return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    };

    const fmtLabel = (s: string) =>
      s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const statusColors: Record<string, string> = {
      new:             "#3B82F6",
      assigned:        "#8B5CF6",
      scheduled:       "#6366F1",
      in_progress:     "#F59E0B",
      on_hold:         "#D97706",
      estimate_needed: "#F59E0B",
      needs_follow_up: "#F59E0B",
      completed:       "#10B981",
      closed:          "#7C3AED",
      cancelled:       "#6B7280",
      archived:        "#64748B",
    };

    // -------------------------------------------------------------------------
    // Build PDF
    // -------------------------------------------------------------------------
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      info: {
        Title:   `Work Order Report — ${workOrder.wo_number}`,
        Author:  companyName,
        Subject: workOrder.title ?? "Work Order Completion Report",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    const W = doc.page.width;   // 595.28
    const H = doc.page.height;  // 841.89
    const L = 50;               // left margin
    const R = W - 50;           // right edge
    const CONTENT_W = R - L;    // 495.28

    // Top accent bar
    doc.rect(0, 0, W, 5).fill("#06B6D4");

    // ── HEADER ──────────────────────────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#0F172A")
       .text(pdfText(companyName), L, 22);

    const brandingContact = [companyPhone, companyEmail].filter(Boolean).map((v) => pdfText(v)).join("  ·  ");
    const headerSubtitle = brandingContact
      ? `WORK ORDER COMPLETION REPORT  ·  ${brandingContact}`
      : "WORK ORDER COMPLETION REPORT";
    doc.fontSize(8).font("Helvetica").fillColor("#94A3B8")
       .text(headerSubtitle, L, 47, { width: CONTENT_W - 100 });

    // WO number top-right
    doc.fontSize(14).font("Helvetica-Bold").fillColor("#06B6D4")
       .text(pdfText(workOrder.wo_number), L, 22, { align: "right", width: CONTENT_W });

    // Status pill
    const statusBg = statusColors[workOrder.status] ?? "#6B7280";
    const statusText = fmtLabel(workOrder.status).toUpperCase();
    const pillW = 90;
    const pillX = R - pillW;
    doc.roundedRect(pillX, 42, pillW, 16, 4).fill(statusBg);
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#FFFFFF")
       .text(statusText, pillX, 47, { width: pillW, align: "center" });

    // Divider
    doc.moveTo(L, 72).lineTo(R, 72).strokeColor("#E2E8F0").lineWidth(1).stroke();

    // ── JOB TITLE + SUBTITLE ────────────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").fillColor("#0F172A")
       .text(pdfText(workOrder.title) || "Untitled Work Order", L, 82, { width: CONTENT_W });

    const titleBottom = doc.y;

    const hasProperty = !!(workOrder.property_customer_name || workOrder.property_address);
    const subtitle = hasProperty
      ? `${pdfText(workOrder.property_customer_name)} · ${pdfText(workOrder.property_address)}`.trim().replace(/^·\s*/, "")
      : "Property not linked";

    doc.fontSize(10).font("Helvetica").fillColor("#64748B")
       .text(subtitle, L, titleBottom + 4, { width: CONTENT_W });

    let yPos = doc.y + 18;

    // ── SECTION / FIELD HELPERS ─────────────────────────────────────────────
    function newPageIfNeeded(needed = 80) {
      if (yPos > H - needed) {
        doc.addPage();
        yPos = 50;
      }
    }

    function sectionLabel(label: string) {
      newPageIfNeeded(60);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#94A3B8")
         .text(label, L, yPos);
      yPos = doc.y + 2;
      doc.moveTo(L, yPos).lineTo(R, yPos).strokeColor("#F1F5F9").lineWidth(0.5).stroke();
      yPos += 10;
    }

    // Two-column field row
    function fieldRow(
      label1: string, val1: string,
      label2?: string, val2?: string
    ) {
      const col2X = L + CONTENT_W / 2 + 10;
      doc.fontSize(8).font("Helvetica").fillColor("#94A3B8").text(label1, L, yPos);
      if (label2) doc.text(label2, col2X, yPos);
      yPos = doc.y + 2;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#1E293B")
         .text(val1 || "N/A", L, yPos, { width: CONTENT_W / 2 - 10 });
      if (label2) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#1E293B")
           .text(val2 || "N/A", col2X, yPos, { width: CONTENT_W / 2 - 10 });
      }
      yPos = doc.y + 12;
    }

    // ── JOB INFORMATION ─────────────────────────────────────────────────────
    sectionLabel("JOB INFORMATION");
    fieldRow(
      "SERVICE CATEGORY", fmtLabel(workOrder.service_category ?? "N/A"),
      "PRIORITY",         fmtLabel(workOrder.priority ?? "N/A")
    );
    fieldRow(
      "SCHEDULED DATE", fmtDate(workOrder.scheduled_date),
      "COMPLETED DATE",  fmtDate(workOrder.completed_at)
    );
    fieldRow("CREATED", fmtDate(workOrder.created_at));
    yPos += 6;

    // ── DESCRIPTION ─────────────────────────────────────────────────────────
    if (workOrder.description) {
      sectionLabel("DESCRIPTION");
      doc.fontSize(10).font("Helvetica").fillColor("#374151")
         .text(pdfText(workOrder.description, 4000), L, yPos, { width: CONTENT_W, lineGap: 3 });
      yPos = doc.y + 16;
    }

    // ── CONTRACT VALUE (financial — gated by canViewFinancialReports) ───────
    if (canViewFinancials && (workOrder.approved_contract_amount_cents != null || workOrder.budget_cents != null || workOrder.actual_cost_cents != null)) {
      sectionLabel("CONTRACT VALUE");
      fieldRow(
        "APPROVED CONTRACT AMOUNT", workOrder.approved_contract_amount_cents != null ? pdfText(formatCents(workOrder.approved_contract_amount_cents)) : "N/A",
        "BUDGET",                   workOrder.budget_cents != null ? pdfText(formatCents(workOrder.budget_cents)) : "N/A"
      );
      fieldRow("ACTUAL COST", workOrder.actual_cost_cents != null ? pdfText(formatCents(workOrder.actual_cost_cents)) : "N/A");
      yPos += 6;
    }

    // ── PROPERTY ────────────────────────────────────────────────────────────
    if (hasProperty) {
      sectionLabel("PROPERTY DETAILS");
      fieldRow(
        "CUSTOMER NAME",   pdfText(workOrder.property_customer_name) || "N/A",
        "SERVICE ADDRESS", pdfText(workOrder.property_address) || "N/A"
      );
      if (accessNotes) {
        const safeAccessNotes = pdfText(accessNotes, 2000);
        doc.fontSize(8).font("Helvetica").fillColor("#94A3B8").text("ACCESS NOTES", L, yPos);
        yPos = doc.y + 2;
        // Amber note block
        const noteLines = Math.max(1, Math.ceil(safeAccessNotes.length / 85));
        const noteH = 10 + noteLines * 14 + 8;
        doc.roundedRect(L, yPos, CONTENT_W, noteH, 4).fill("#FFFBEB");
        doc.fontSize(10).font("Helvetica").fillColor("#92400E")
           .text(safeAccessNotes, L + 8, yPos + 8, { width: CONTENT_W - 16, lineGap: 3 });
        yPos = doc.y + 16;
      }
      yPos += 6;
    }

    // ── APPROVED CHANGE ORDERS ───────────────────────────────────────────────
    if (acceptedChangeOrders.length > 0) {
      sectionLabel("APPROVED CHANGE ORDERS");
      for (const co of acceptedChangeOrders) {
        newPageIfNeeded(70);
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A")
           .text(pdfText(co.change_order_number), L, yPos, { width: CONTENT_W });
        if (canViewFinancials) {
          doc.fontSize(10).font("Helvetica-Bold").fillColor("#059669")
             .text(pdfText(formatCents(co.price_impact_cents)), L, yPos, { width: CONTENT_W, align: "right" });
        }
        yPos = doc.y + 3;
        doc.fontSize(9).font("Helvetica").fillColor("#374151")
           .text(pdfText(co.reason, 1000), L, yPos, { width: CONTENT_W, lineGap: 2 });
        yPos = doc.y + 2;
        if (co.schedule_impact_days) {
          doc.fontSize(8).font("Helvetica").fillColor("#64748B")
             .text(`Schedule impact: ${co.schedule_impact_days > 0 ? "+" : ""}${co.schedule_impact_days} day(s)${co.schedule_impact_applied_at ? " (applied)" : ""}`, L, yPos);
          yPos = doc.y + 2;
        }
        doc.fontSize(8).font("Helvetica").fillColor("#94A3B8")
           .text(`Accepted ${fmtDate(co.accepted_at)}${co.accepted_by_name ? ` by ${pdfText(co.accepted_by_name)}` : ""}`, L, yPos);
        yPos = doc.y + 10;
      }
      yPos += 6;
    }

    // ── VISITS & CHECKLISTS ──────────────────────────────────────────────────
    sectionLabel("VISIT RECORDS & CHECKLISTS");

    if (visits.length === 0) {
      doc.fontSize(10).font("Helvetica").fillColor("#94A3B8")
         .text("No visits recorded for this work order.", L, yPos);
      yPos = doc.y + 16;
    } else {
      for (const visit of visits) {
        const items = Array.isArray(visit.checklist) ? visit.checklist : [];
        const completedCount = items.filter((i) => i.completed).length;

        // Estimate block height to decide if new page needed
        const blockH = 28 + (items.length > 0 ? 16 + items.length * 18 : 18)
          + (visit.technician_notes ? 50 : 0);
        newPageIfNeeded(blockH + 20);

        // Visit header bar
        doc.roundedRect(L, yPos, CONTENT_W, 22, 4).fill("#F1F5F9");
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#0F172A")
           .text(`Visit — ${fmtDate(visit.scheduled_date)}`, L + 8, yPos + 6);
        doc.fontSize(8).font("Helvetica").fillColor("#64748B")
           .text(fmtLabel(visit.status ?? "unknown").toUpperCase(), L, yPos + 7,
             { width: CONTENT_W - 8, align: "right" });
        yPos += 28;

        // Checklist progress
        if (items.length > 0) {
          doc.fontSize(8).font("Helvetica").fillColor("#64748B")
             .text(`${completedCount} of ${items.length} items completed`, L + 8, yPos);
          yPos = doc.y + 8;

          for (const item of items) {
            newPageIfNeeded(30);
            if (item.completed) {
              doc.roundedRect(L + 8, yPos, 12, 12, 2).fill("#ECFDF5");
              doc.fillColor("#059669").fontSize(9).font("Helvetica-Bold")
                 .text("✓", L + 11, yPos + 1);
            } else {
              doc.roundedRect(L + 8, yPos, 12, 12, 2).fillAndStroke("#F8FAFC", "#E2E8F0");
              doc.fillColor("#CBD5E1").fontSize(9).font("Helvetica")
                 .text("○", L + 12, yPos + 1);
            }
            doc.fontSize(10).font("Helvetica")
               .fillColor(item.completed ? "#374151" : "#94A3B8")
               .text(pdfText(item.label), L + 26, yPos + 1, { width: CONTENT_W - 34 });
            yPos = doc.y + 6;
          }
        } else {
          doc.fontSize(10).font("Helvetica").fillColor("#94A3B8")
             .text("No checklist items recorded.", L + 8, yPos);
          yPos = doc.y + 10;
        }

        // Technician notes
        if (visit.technician_notes) {
          newPageIfNeeded(60);
          yPos += 4;
          const safeNote = pdfText(visit.technician_notes, 5000);
          const noteLines = Math.max(1, Math.ceil(safeNote.length / 85));
          const noteBlockH = 14 + noteLines * 14 + 10;
          doc.roundedRect(L + 8, yPos, CONTENT_W - 8, noteBlockH, 4).fill("#FFFBEB");
          doc.fontSize(8).font("Helvetica-Bold").fillColor("#92400E")
             .text("TECHNICIAN NOTES", L + 16, yPos + 6);
          yPos = doc.y + 4;
          doc.fontSize(10).font("Helvetica").fillColor("#78350F")
             .text(safeNote, L + 16, yPos, { width: CONTENT_W - 32, lineGap: 3 });
          yPos = doc.y + 12;
        }

        // Materials + time entry
        if (visit.material_usage || visit.time_entry_minutes != null) {
          newPageIfNeeded(40);
          yPos += 4;
          if (visit.time_entry_minutes != null) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#94A3B8").text("TIME LOGGED", L + 8, yPos);
            yPos = doc.y + 2;
            doc.fontSize(10).font("Helvetica").fillColor("#1E293B")
               .text(`${visit.time_entry_minutes} minutes`, L + 8, yPos);
            yPos = doc.y + 8;
          }
          if (visit.material_usage) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#94A3B8").text("MATERIALS USED", L + 8, yPos);
            yPos = doc.y + 2;
            doc.fontSize(10).font("Helvetica").fillColor("#1E293B")
               .text(pdfText(visit.material_usage, 2000), L + 8, yPos, { width: CONTENT_W - 16, lineGap: 2 });
            yPos = doc.y + 8;
          }
        }

        // Equipment reading + completion reason
        if (visit.equipment_reading || visit.completion_reason) {
          newPageIfNeeded(40);
          if (visit.equipment_reading) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#94A3B8").text("EQUIPMENT READING", L + 8, yPos);
            yPos = doc.y + 2;
            doc.fontSize(10).font("Helvetica").fillColor("#1E293B")
               .text(pdfText(visit.equipment_reading, 500), L + 8, yPos, { width: CONTENT_W - 16 });
            yPos = doc.y + 8;
          }
          if (visit.completion_reason) {
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#94A3B8").text("COMPLETION REASON", L + 8, yPos);
            yPos = doc.y + 2;
            doc.fontSize(10).font("Helvetica").fillColor("#1E293B")
               .text(pdfText(visit.completion_reason, 1000), L + 8, yPos, { width: CONTENT_W - 16, lineGap: 2 });
            yPos = doc.y + 8;
          }
        }

        // Customer signature
        if (visit.customer_signature) {
          newPageIfNeeded(50);
          yPos += 4;
          doc.roundedRect(L + 8, yPos, CONTENT_W - 16, 34, 4).fillAndStroke("#F8FAFC", "#E2E8F0");
          doc.fontSize(8).font("Helvetica-Bold").fillColor("#64748B")
             .text("CUSTOMER SIGNATURE", L + 16, yPos + 6);
          doc.fontSize(13).font("Helvetica-Oblique").fillColor("#0F172A")
             .text(pdfText(visit.customer_signature, 200), L + 16, yPos + 16, { width: CONTENT_W - 32 });
          yPos += 42;
        }

        yPos += 14;
      }
    }

    // ── FOOTER (fixed to bottom of last page) ────────────────────────────────
    const footerY = H - 45;
    doc.moveTo(L, footerY).lineTo(R, footerY).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    doc.fontSize(8).font("Helvetica").fillColor("#94A3B8")
       .text(`Generated by ${companyName} via ServiceOps`, L, footerY + 8);
    doc.text(new Date().toLocaleString("en-US"), L, footerY + 8, { align: "center", width: CONTENT_W });
    doc.text(workOrder.wo_number, L, footerY + 8, { align: "right", width: CONTENT_W });

    // ── Finalize ─────────────────────────────────────────────────────────────
    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    const filename = `ServiceOps-${workOrder.wo_number}-Report.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(pdfBuffer.length),
        "Cache-Control":       "private, no-cache",
      },
    });

  } catch (error) {
    console.error("[PDF Report] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate report", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
