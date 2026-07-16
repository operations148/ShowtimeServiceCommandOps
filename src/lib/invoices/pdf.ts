import PDFDocument from "pdfkit";
import type { PublicInvoice } from "@/types/invoice";
import { pdfText } from "@/lib/pdf/pdf-text";
import { formatCents } from "@/lib/money/money";

/**
 * Generates a customer-facing invoice PDF from the REDACTED public view
 * (Phase 6, mirrors src/lib/estimates/pdf.ts). Driving from PublicInvoice
 * guarantees internal costs / tenant / provider ids can never appear — the
 * type simply doesn't carry them. Every interpolated value passes through
 * pdfText().
 *
 * pdfkit is CJS and listed in serverExternalPackages so webpack preserves its
 * built-in font require()s (same setup as the estimate PDF + WO report).
 */
export function buildInvoicePdf(view: PublicInvoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const navy = "#0C1E2E";
      const slate = "#475569";
      const muted = "#94A3B8";
      const green = "#059669";

      // Header
      doc.fillColor(navy).fontSize(20).text(pdfText(view.company_name), { continued: false });
      doc.moveDown(0.2);
      doc.fillColor(muted).fontSize(10);
      if (view.company_phone) doc.text(pdfText(view.company_phone));
      if (view.company_email) doc.text(pdfText(view.company_email));

      doc.moveDown(1);
      doc.fillColor(navy).fontSize(16).text(`Invoice ${pdfText(view.invoice_number)}`);
      doc.fillColor(slate).fontSize(12).text(pdfText(view.title));
      if (view.milestone_label) {
        doc.fillColor(muted).fontSize(10).text(pdfText(view.milestone_label));
      }
      doc.moveDown(0.3);
      doc.fillColor(muted).fontSize(10);
      doc.text(`Billed to: ${pdfText(view.customer_name)}`);
      doc.text(`Issued: ${pdfText(view.issue_date)}`);
      if (view.due_date) doc.text(`Due: ${pdfText(view.due_date)}`);
      doc.text(`Status: ${pdfText(view.status.replace(/_/g, " "))}`);

      doc.moveDown(1);

      // Line items
      doc.fillColor(navy).fontSize(11).text("Line Items");
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(slate);
      for (const line of view.line_items) {
        const qty = pdfText(String(line.quantity));
        const price = pdfText(formatCents(line.unit_price));
        const total = pdfText(formatCents(line.total));
        doc.fillColor(navy).text(pdfText(line.description), { continued: false });
        if (line.details) doc.fillColor(muted).fontSize(9).text(pdfText(line.details));
        doc.fillColor(slate).fontSize(10).text(`  ${qty} × ${price}   =   ${total}`);
        doc.moveDown(0.3);
      }

      doc.moveDown(0.5);
      // Totals
      doc.fillColor(slate).fontSize(10);
      doc.text(`Subtotal: ${pdfText(formatCents(view.subtotal))}`, { align: "right" });
      if (view.discount_amount > 0) {
        doc.text(`Discount: -${pdfText(formatCents(view.discount_amount))}`, { align: "right" });
      }
      doc.text(`Tax: ${pdfText(formatCents(view.tax_amount))}`, { align: "right" });
      doc.fillColor(navy).fontSize(13).text(`Total: ${pdfText(formatCents(view.total))}`, { align: "right" });
      doc.moveDown(0.3);
      doc.fillColor(slate).fontSize(10);
      doc.text(`Amount paid: ${pdfText(formatCents(view.amount_paid))}`, { align: "right" });
      if (view.amount_refunded > 0) {
        doc.text(`Refunded: ${pdfText(formatCents(view.amount_refunded))}`, { align: "right" });
      }
      const dueColor = view.amount_due > 0 ? "#B91C1C" : green;
      doc.fillColor(dueColor).fontSize(13).text(`Amount due: ${pdfText(formatCents(view.amount_due))}`, { align: "right" });

      // Payment history
      if (view.payments.length > 0) {
        doc.moveDown(1);
        doc.fillColor(navy).fontSize(11).text("Payment History");
        doc.fontSize(10).fillColor(slate);
        for (const p of view.payments) {
          const label = p.kind === "refund" ? "Refund" : p.kind === "credit" ? "Credit" : "Payment";
          const when = pdfText(new Date(p.created_at).toLocaleDateString("en-US"));
          doc.text(`  ${when} — ${label}: ${pdfText(formatCents(p.amount))}`);
        }
      }

      // Notes + payment instructions + terms
      if (view.notes) {
        doc.moveDown(1);
        doc.fillColor(navy).fontSize(11).text("Notes");
        doc.fillColor(slate).fontSize(10).text(pdfText(view.notes, 4000));
      }
      if (view.payment_instructions) {
        doc.moveDown(1);
        doc.fillColor(navy).fontSize(11).text("Payment Instructions");
        doc.fillColor(slate).fontSize(10).text(pdfText(view.payment_instructions, 2000));
      }
      if (view.terms) {
        doc.moveDown(1);
        doc.fillColor(navy).fontSize(11).text("Terms");
        doc.fillColor(muted).fontSize(9).text(pdfText(view.terms, 6000));
      }

      // Paid stamp
      if (view.paid_at) {
        doc.moveDown(1);
        doc.fillColor(green).fontSize(11).text(`PAID — ${pdfText(new Date(view.paid_at).toLocaleString("en-US"))}`);
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
