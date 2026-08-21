import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET /api/ghl/webhooks/health
//
// UNAUTHENTICATED, publicly reachable. Everything here is visible to anyone
// on the internet, so it exposes only booleans that answer "is this endpoint
// configured at all" — never values, never lengths, never anything that
// narrows a search space for an attacker.
//
// Removed deliberately (Phase 11 hardening):
//   secretLength — previously returned the exact character count of
//   GHL_WEBHOOK_SECRET to any anonymous caller. It served no operational
//   purpose (nothing in this codebase reads it) while telling an attacker
//   precisely how long the secret is. `webhookSecretConfigured` answers the
//   only question an operator actually needs from a public probe.
// ---------------------------------------------------------------------------

export async function GET() {
  const secret = process.env.GHL_WEBHOOK_SECRET ?? "";
  const webhookSecretConfigured = secret.trim().length > 0;

  // mockMode is derived from whether an outbound GHL token exists at all.
  // It is a boolean about configuration, not about the token itself.
  const mockMode =
    process.env.APP_ENV === "development" ||
    !process.env.GHL_PRIVATE_INTEGRATION_TOKEN;

  return NextResponse.json({
    ok: true,
    webhookSecretConfigured,
    mockMode,
  });
}
