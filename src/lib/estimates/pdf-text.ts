/**
 * Normalizes an untrusted value for safe inclusion in a generated PDF (Phase 3).
 *
 * pdfkit renders plain text (not markup), so the risk is not XSS but layout/
 * content corruption from control characters, and non-string inputs throwing.
 * This coerces to a string, strips C0/C1 control characters (keeping newline
 * and tab), and caps length so a pathological value cannot blow out the
 * document.
 */
// C0 controls except \t (\x09) and \n (\x0A); plus \x0B\x0C\x0D and C1 (\x7F-\x9F)
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;

export function pdfText(value: unknown, maxLen = 2000): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(CONTROL_CHARS, "");
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}
