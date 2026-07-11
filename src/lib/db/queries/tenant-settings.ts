import { db } from "@/lib/db/client";
import { DEFAULT_TIMEZONE } from "@/lib/scheduling/timezone";

/** Returns the tenant's IANA timezone, falling back to the default. */
export async function getTenantTimezone(tenantId: string): Promise<string> {
  const { data, error } = await db
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getTenantTimezone: ${error.message}`);
  const tz = (data as { timezone?: string | null } | null)?.timezone;
  return tz && tz.length > 0 ? tz : DEFAULT_TIMEZONE;
}
