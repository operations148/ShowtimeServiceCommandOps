import { describe, it, expect } from "vitest";
import { resolveQueryState } from "./useApiQuery";

// Prompt 11 hardening: the final link in the "database failure looked like an
// empty list" chain.
//
// The hook decided success purely from whether the parsed body had an `error`
// key — it never looked at the status. So any non-2xx response that omitted
// that key surfaced as a successful EMPTY result, which WorkOrdersTable then
// rendered as "No work orders yet. Create one to get started." — an inviting
// empty state produced by a server error.
//
// Tested as a pure function rather than through a React renderer: this repo
// has no component-test infrastructure (vitest runs in `node`, no jsdom, no
// testing-library), and the decision rule is what changed, not the rendering.

const ok = { ok: true, status: 200 };

describe("resolveQueryState", () => {
  it("reports an error for a non-2xx response even when the body has NO error key", () => {
    // The exact regression this hardening exists to prevent.
    const state = resolveQueryState({ ok: false, status: 500 }, {});

    expect(state.error).toBeTruthy();
    expect(state.error).toContain("500");
    expect(state.data).toBeNull();
  });

  it("prefers the server's own message when one is provided", () => {
    const state = resolveQueryState({ ok: false, status: 500 }, { error: "Failed to load work orders" });

    expect(state.error).toBe("Failed to load work orders");
    expect(state.data).toBeNull();
  });

  it("reports an error when a failed response had no parseable body at all", () => {
    // Platform error pages / gateway timeouts are often HTML, so the caller
    // passes null after JSON parsing throws.
    const state = resolveQueryState({ ok: false, status: 502 }, null);

    expect(state.error).toContain("502");
    expect(state.data).toBeNull();
  });

  it("never reports a non-2xx as a successful empty collection", () => {
    for (const status of [400, 401, 403, 404, 422, 500, 502, 503]) {
      const state = resolveQueryState<unknown[]>({ ok: false, status }, { data: [] });
      expect(state.error, `status ${status} must surface an error`).toBeTruthy();
      // Critically: it must NOT hand back [] as if the tenant were empty.
      expect(state.data, `status ${status} must not yield data`).toBeNull();
    }
  });

  it("still treats a genuinely empty 200 as success — the real empty state is preserved", () => {
    const state = resolveQueryState<unknown[]>(ok, { data: [], total: 0 } as { data: unknown[] });

    expect(state.error).toBeNull();
    expect(state.data).toEqual([]);
  });

  it("returns data on a normal successful response", () => {
    const rows = [{ id: "wo-1" }];
    const state = resolveQueryState(ok, { data: rows });

    expect(state.data).toEqual(rows);
    expect(state.error).toBeNull();
  });

  it("honours an error key returned alongside a 200", () => {
    const state = resolveQueryState(ok, { error: "Unauthorized — sign in to continue" });

    expect(state.error).toBe("Unauthorized — sign in to continue");
    expect(state.data).toBeNull();
  });

  it("always clears the loading flag", () => {
    expect(resolveQueryState(ok, { data: 1 }).loading).toBe(false);
    expect(resolveQueryState({ ok: false, status: 500 }, null).loading).toBe(false);
  });
});
