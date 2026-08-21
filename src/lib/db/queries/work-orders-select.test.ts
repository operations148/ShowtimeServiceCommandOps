import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { WO_SELECT } from "./work-orders";

// Regression guard for the PostgREST embed ambiguity that took production down.
//
// work_orders has three foreign keys to users: assigned_technician_id,
// archived_by and closed_by (the latter two added in Phase 5). A bare
// `users(name)` embed cannot be resolved against three candidates, so PostgREST
// rejected the entire query with PGRST201 — which broke every work-order read
// AND write at once. Because GET /api/work-orders catches query errors and
// returns an empty list, it surfaced as a silently empty dashboard rather than
// an error, and the GHL webhook crashed inside its idempotency lookup before it
// could ever insert a work order.
//
// These tests are string-level on purpose: they fail fast in CI without needing
// a live database, and they pin the exact property that was wrong.

const TECHNICIAN_FK_HINT = "users!work_orders_assigned_technician_id_fkey";

describe("WO_SELECT", () => {
  it("names the foreign key explicitly when embedding users", () => {
    expect(WO_SELECT).toContain(TECHNICIAN_FK_HINT);
  });

  it("contains no bare users embed", () => {
    // A bare `users(` is exactly what produced PGRST201.
    const bareUsersEmbed = /(^|[^!\w])users\(/;
    expect(bareUsersEmbed.test(WO_SELECT)).toBe(false);
  });

  it("embeds through assigned_technician_id, not archived_by or closed_by", () => {
    // Disambiguating to the wrong FK would "work" while silently returning the
    // archiving/closing user's name in place of the assigned technician.
    expect(WO_SELECT).not.toContain("work_orders_archived_by_fkey");
    expect(WO_SELECT).not.toContain("work_orders_closed_by_fkey");
  });

  it("still selects the property relation the list view depends on", () => {
    expect(WO_SELECT).toContain("properties(");
  });
});

describe("every work_orders users-embed in the query layer", () => {
  // properties.ts builds its own work_orders query rather than using WO_SELECT,
  // and carried the identical bug.
  const queryFiles = ["work-orders.ts", "properties.ts"];

  for (const file of queryFiles) {
    it(`${file} never embeds users from work_orders without an FK hint`, () => {
      const source = readFileSync(path.join(__dirname, file), "utf8");

      // Strip comments so the explanatory text above each fix is not scanned.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

      const bareUsersEmbed = /(^|[^!\w])users\(/;
      expect(bareUsersEmbed.test(code)).toBe(false);
    });
  }
});
