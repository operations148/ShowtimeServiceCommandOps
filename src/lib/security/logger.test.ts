import { describe, it, expect, vi, afterEach } from "vitest";
import { logger, maskEmail } from "./logger";

describe("logger redaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts sensitive fields before emitting", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("login attempt", { email: "user@example.com", password: "hunter2", userId: "abc" });
    const line = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.email).toBe("[REDACTED]");
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.userId).toBe("abc");
  });

  it("truncates long string values", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("event", { note: "x".repeat(500) });
    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect((parsed.note as string).length).toBeLessThan(500);
  });
});

describe("maskEmail", () => {
  it("keeps only the first character and domain", () => {
    expect(maskEmail("alex@showtime.local")).toBe("a***@showtime.local");
  });

  it("returns REDACTED for malformed input", () => {
    expect(maskEmail("not-an-email")).toBe("[REDACTED]");
  });
});
