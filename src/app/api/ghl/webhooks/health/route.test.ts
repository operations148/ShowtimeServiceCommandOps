import { describe, it, expect, beforeEach, vi } from "vitest";

// Prompt 11 hardening: this endpoint is UNAUTHENTICATED and publicly
// reachable, so its response body is visible to anyone on the internet.
// It previously returned `secretLength` — the exact character count of
// GHL_WEBHOOK_SECRET — to any anonymous caller.

const SECRET = "a-test-webhook-secret-of-known-length";

async function loadHealth() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  delete process.env.APP_ENV;
  delete process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
});

describe("GET /api/ghl/webhooks/health — public exposure", () => {
  it("never returns the secret length", async () => {
    const { GET } = await loadHealth();
    const body = await (await GET()).json();

    expect(body).not.toHaveProperty("secretLength");
    // Belt and braces: no key anywhere whose value equals the real length.
    expect(Object.values(body)).not.toContain(SECRET.length);
  });

  it("never returns the secret itself, in any field", async () => {
    const { GET } = await loadHealth();
    const raw = await (await GET()).text();

    expect(raw).not.toContain(SECRET);
    expect(raw.toLowerCase()).not.toContain("length");
  });

  it("still answers the only question a public probe needs: is it configured", async () => {
    const { GET } = await loadHealth();
    const body = await (await GET()).json();

    expect(body.ok).toBe(true);
    expect(body.webhookSecretConfigured).toBe(true);
  });

  it("reports not-configured without leaking that fact's detail", async () => {
    delete process.env.GHL_WEBHOOK_SECRET;
    const { GET } = await loadHealth();
    const body = await (await GET()).json();

    expect(body.webhookSecretConfigured).toBe(false);
    expect(body).not.toHaveProperty("secretLength");
  });

  it("exposes only a known-safe set of keys", async () => {
    const { GET } = await loadHealth();
    const body = await (await GET()).json();

    // Any new field here must be reviewed as PUBLIC before being added.
    expect(Object.keys(body).sort()).toEqual(["mockMode", "ok", "webhookSecretConfigured"]);
  });

  it("returns only booleans — no strings that could carry values", async () => {
    const { GET } = await loadHealth();
    const body = await (await GET()).json();

    for (const [key, value] of Object.entries(body)) {
      expect(typeof value, `${key} should be boolean`).toBe("boolean");
    }
  });
});
