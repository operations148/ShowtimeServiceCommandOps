import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET /api/ghl/webhooks/health
//
// Safe diagnostic endpoint — confirms webhook secret is configured.
// Does NOT expose the secret value or any sensitive data.
// ---------------------------------------------------------------------------

export async function GET() {
  const secret = process.env.GHL_WEBHOOK_SECRET ?? "";
  const webhookSecretConfigured = secret.trim().length > 0;
  const mockMode =
    process.env.APP_ENV === "development" ||
    !process.env.GHL_PRIVATE_INTEGRATION_TOKEN;

  return NextResponse.json({
    ok: true,
    webhookSecretConfigured,
    mockMode,
    secretLength: webhookSecretConfigured ? secret.trim().length : 0,
  });
}
