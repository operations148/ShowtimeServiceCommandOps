import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("./resend", () => ({
  getResend: () => ({ emails: { send: (...args: unknown[]) => sendMock(...args) } }),
}));

import { safeSend, resolveMailMode } from "./safe-mailer";

const baseArgs = { to: "customer@example.com", subject: "Test", html: "<p>hi</p>" };

describe("resolveMailMode", () => {
  afterEach(() => {
    delete process.env.ESTIMATE_EMAIL_MODE;
  });
  it("defaults to preview", () => {
    delete process.env.ESTIMATE_EMAIL_MODE;
    expect(resolveMailMode()).toBe("preview");
  });
  it("reads test/live", () => {
    process.env.ESTIMATE_EMAIL_MODE = "test";
    expect(resolveMailMode()).toBe("test");
    process.env.ESTIMATE_EMAIL_MODE = "LIVE";
    expect(resolveMailMode()).toBe("live");
  });
  it("treats unknown values as preview", () => {
    process.env.ESTIMATE_EMAIL_MODE = "nonsense";
    expect(resolveMailMode()).toBe("preview");
  });
});

describe("safeSend", () => {
  beforeEach(() => {
    sendMock.mockReset();
    delete process.env.ESTIMATE_EMAIL_MODE;
    delete process.env.ESTIMATE_TEST_RECIPIENT;
  });

  it("preview mode never calls the provider", async () => {
    const r = await safeSend(baseArgs);
    expect(sendMock).not.toHaveBeenCalled();
    expect(r).toMatchObject({ delivered: false, mode: "preview", previewMode: true });
  });

  it("test mode redirects to the test recipient", async () => {
    process.env.ESTIMATE_EMAIL_MODE = "test";
    process.env.ESTIMATE_TEST_RECIPIENT = "qa@internal.example";
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });

    const r = await safeSend(baseArgs);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]![0] as { to: string[] };
    expect(call.to).toEqual(["qa@internal.example"]); // NOT customer@example.com
    expect(r).toMatchObject({ delivered: true, testOverride: true, effectiveRecipient: "qa@internal.example" });
  });

  it("test mode without a test recipient fails safe (no delivery)", async () => {
    process.env.ESTIMATE_EMAIL_MODE = "test";
    const r = await safeSend(baseArgs);
    expect(sendMock).not.toHaveBeenCalled();
    expect(r.delivered).toBe(false);
    if (!r.delivered && "error" in r) expect(r.error).toMatch(/ESTIMATE_TEST_RECIPIENT/);
  });

  it("live mode delivers to the real recipient", async () => {
    process.env.ESTIMATE_EMAIL_MODE = "live";
    sendMock.mockResolvedValue({ data: { id: "msg_9" }, error: null });
    const r = await safeSend(baseArgs);
    const call = sendMock.mock.calls[0]![0] as { to: string[] };
    expect(call.to).toEqual(["customer@example.com"]);
    expect(r).toMatchObject({ delivered: true, testOverride: false, providerMessageId: "msg_9" });
  });

  it("surfaces provider errors as a failure state (for manual retry)", async () => {
    process.env.ESTIMATE_EMAIL_MODE = "live";
    sendMock.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });
    const r = await safeSend(baseArgs);
    expect(r.delivered).toBe(false);
    if (!r.delivered && "error" in r) expect(r.error).toMatch(/quota/);
  });
});
