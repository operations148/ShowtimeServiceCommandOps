import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-auth";

// ---------------------------------------------------------------------------
// GET /api/ghl/test-connection
//
// Temporary diagnostic route — confirms GHL Private Integration Token is
// valid and the location is reachable. Delete once connection is confirmed.
// Never logs or returns the full token value.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

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
    const res = await fetch(`${baseUrl}/locations/${locationId}`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": "application/json",
        Version:        "2021-07-28",
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({
        connected: false,
        status:    res.status,
        error:     `GHL API returned ${res.status}`,
        hint:
          res.status === 401 ? "Token is invalid or expired" :
          res.status === 403 ? "Token does not have permission for this location" :
          res.status === 404 ? "Location ID not found in GHL" :
          "Check GHL API status",
        body: body.slice(0, 200), // truncate for safety
      });
    }

    const data = await res.json() as { location?: Record<string, string> };
    const loc  = data.location ?? {};

    return NextResponse.json({
      connected:   true,
      location: {
        id:      loc.id,
        name:    loc.name,
        email:   loc.email,
        phone:   loc.phone,
        address: loc.address,
        city:    loc.city,
        state:   loc.state,
      },
      tokenPrefix: `${token.substring(0, 8)}...`,
      apiVersion:  "2021-07-28",
    });

  } catch (error) {
    return NextResponse.json({
      connected: false,
      error:     error instanceof Error ? error.message : "Network error",
    });
  }
}
