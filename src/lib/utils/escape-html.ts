/**
 * HTML entity escaping for interpolating untrusted values into email templates
 * and server-rendered proposal markup (Phase 3). Prevents template/PDF XSS —
 * every customer/estimate value MUST pass through this before landing in HTML.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"'`]/g, (c) => HTML_ENTITIES[c]!);
}
