import { type NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET /api/ghl/test-connection
//
// Temporary diagnostic route — no auth required (returns no sensitive data).
// Confirms GHL Private Integration Token is valid and location is reachable.
// DELETE THIS FILE once connection is confirmed working.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {

  const token      = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID ?? process.env.NEXT_PUBLIC_GHL_LOCATION_ID;
  const baseUrl    = process.env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com";

  if (!token) {
    return NextResponse.json({ connected: false, error: "GHL_PRIVATE_INTEGRATION_TOKEN not set" });
  }
  if (!locationId) {
    return NextResponse.json({ connected: false, error: "GHL_LOCATION_ID (or NEXT_PUBLIC_GHL_LOCATION_ID) not set" });
  }

  try {
    // Use /contacts/ — requires contacts.readonly scope (standard for integrations).
    // /locations/{id} requires a separate locations scope that many tokens lack.
    const res = await fetch(
      `${baseUrl}/contacts/?locationId=${locationId}&limit=1`,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
          Version:        "2021-07-28",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({
        connected: false,
        status:    res.status,
        error:     `GHL API returned ${res.status}`,
        hint:
          res.status === 401 ? "Token is invalid, expired, or missing contacts.readonly scope in GHL Private Integration settings" :
          res.status === 403 ? "Token does not have permission for this location" :
          res.status === 404 ? "Location ID not found in GHL" :
          "Check GHL API status",
        body: body.slice(0, 300),
      });
    }

    const data = await res.json() as { contacts?: unknown[]; meta?: { total?: number } };

    return NextResponse.json({
      connected:      true,
      contactsFound:  data.meta?.total ?? (data.contacts?.length ?? 0),
      locationId,
      tokenPrefix:    `${token.substring(0, 8)}...`,
      apiVersion:     "2021-07-28",
      message:        "GHL API connection successful",
    });

  } catch (error) {
    return NextResponse.json({
      connected: false,
      error:     error instanceof Error ? error.message : "Network error",
    });
  }
}
