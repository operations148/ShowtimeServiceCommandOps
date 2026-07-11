import PDFDocument from "pdfkit";
import type { PublicEstimate } from "@/types/estimate";
import { pdfText } from "@/lib/pdf/pdf-text";
import { formatCents } from "@/lib/money/money";

/**
 * Generates a customer-facing proposal PDF from the REDACTED public view of an
 * estimate (Phase 3). Driving from PublicEstimate guarantees internal costs /
 * notes can never appear on the document — the type simply doesn't carry them.
 * Every interpolated value passes through pdfText().
 *
 * pdfkit is CJS and listed in serverExternalPackages so webpack preserves its
 * built-in font require()s (same setup as the work-order report route).
 */
export function buildEstimatePdf(view: PublicEstimate): Promise<Buffer> {
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

      // Header
      doc.fillColor(navy).fontSize(20).text(pdfText(view.company_name), { continued: false });
      doc.moveDown(0.2);
      doc.fillColor(muted).fontSize(10);
      if (view.company_phone) doc.text(pdfText(view.company_phone));
      if (view.company_email) doc.text(pdfText(view.company_email));

      doc.moveDown(1);
      doc.fillColor(navy).fontSize(16).text(`Estimate ${pdfText(view.estimate_number)}`);
      doc.fillColor(slate).fontSize(12).text(pdfText(view.title));
      doc.moveDown(0.3);
      doc.fillColor(muted).fontSize(10);
      doc.text(`Prepared for: ${pdfText(view.customer_name)}`);
      doc.text(`Issued: ${pdfText(view.issue_date)}`);
      if (view.expires_at) {
        doc.text(`Valid until: ${pdfText(new Date(view.expires_at).toLocaleDateString("en-US"))}`);
      }

      doc.moveDown(1);

      // Line items (selected only — the public view already carries is_selected)
      const selected = view.line_items.filter((l) => l.kind === "standard" || l.is_selected);
      doc.fillColor(navy).fontSize(11).text("Line Items");
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(slate);
      for (const line of selected) {
        const qty = pdfText(String(line.quantity));
        const unit = line.unit ? ` ${pdfText(line.unit)}` : "";
        const price = pdfText(formatCents(line.unit_price));
        const total = pdfText(formatCents(line.total));
        doc.fillColor(navy).text(pdfText(line.name), { continued: false });
        if (line.description) doc.fillColor(muted).fontSize(9).text(pdfText(line.description));
        doc.fillColor(slate).fontSize(10).text(`  ${qty}${unit} × ${price}   =   ${total}`);
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

      // Notes + terms
      if (view.customer_notes) {
        doc.moveDown(1);
        doc.fillColor(navy).fontSize(11).text("Notes");
        doc.fillColor(slate).fontSize(10).text(pdfText(view.customer_notes, 4000));
      }
      if (view.terms) {
        doc.moveDown(1);
        doc.fillColor(navy).fontSize(11).text("Terms");
        doc.fillColor(muted).fontSize(9).text(pdfText(view.terms, 6000));
      }

      // Decision footer
      if (view.accepted_at) {
        doc.moveDown(1);
        doc.fillColor("#059669").fontSize(10).text(`Accepted on ${pdfText(new Date(view.accepted_at).toLocaleString("en-US"))}`);
      } else if (view.declined_at) {
        doc.moveDown(1);
        doc.fillColor("#DC2626").fontSize(10).text(`Declined on ${pdfText(new Date(view.declined_at).toLocaleString("en-US"))}`);
      }

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
