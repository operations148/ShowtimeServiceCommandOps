import { describe, it, expect } from "vitest";
import { buildAddressQuery, parseNominatim } from "./geocode";
import { ageSeconds, freshnessOf, relativeAgeLabel } from "./location-freshness";

describe("buildAddressQuery", () => {
  it("joins present parts, skipping empties", () => {
    expect(buildAddressQuery({ address_line1: "1 Pool Ln", address_line2: "", city: "Malibu", state: "CA", zip: "90265" }))
      .toBe("1 Pool Ln, Malibu, CA, 90265");
  });
  it("returns empty string when nothing usable", () => {
    expect(buildAddressQuery({ address_line1: "", city: null, state: undefined })).toBe("");
  });
});

describe("parseNominatim", () => {
  it("parses the first result's lat/lon", () => {
    expect(parseNominatim([{ lat: "34.0259", lon: "-118.7798" }])).toEqual({ latitude: 34.0259, longitude: -118.7798 });
  });
  it("returns null for empty or malformed responses", () => {
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim(null)).toBeNull();
    expect(parseNominatim([{ lat: "not-a-number", lon: "5" }])).toBeNull();
    expect(parseNominatim([{ lon: "5" }])).toBeNull();
  });
  it("rejects out-of-range coordinates", () => {
    expect(parseNominatim([{ lat: "200", lon: "5" }])).toBeNull();
    expect(parseNominatim([{ lat: "5", lon: "-999" }])).toBeNull();
  });
});

describe("location freshness", () => {
  const base = Date.parse("2026-07-19T12:00:00Z");

  it("computes age in seconds and clamps negatives to 0", () => {
    expect(ageSeconds("2026-07-19T11:59:00Z", base)).toBe(60);
    expect(ageSeconds("2026-07-19T12:05:00Z", base)).toBe(0); // future -> 0
    expect(ageSeconds("garbage", base)).toBe(Number.POSITIVE_INFINITY);
  });

  it("classifies live / recent / stale by age", () => {
    expect(freshnessOf("2026-07-19T11:59:00Z", base)).toBe("live");   // 1 min
    expect(freshnessOf("2026-07-19T11:50:00Z", base)).toBe("recent"); // 10 min
    expect(freshnessOf("2026-07-19T09:00:00Z", base)).toBe("stale");  // 3 h
  });

  it("never presents a stale ping as live (the core honesty rule)", () => {
    // exactly on the boundaries
    expect(freshnessOf("2026-07-19T11:58:00Z", base)).toBe("live");    // 2 min == LIVE_MAX
    expect(freshnessOf("2026-07-19T11:57:59Z", base)).toBe("recent");  // 2 min 1 s -> not live
    expect(freshnessOf("2026-07-19T11:45:00Z", base)).toBe("recent");  // 15 min == RECENT_MAX
    expect(freshnessOf("2026-07-19T11:44:59Z", base)).toBe("stale");   // 15 min 1 s -> stale
  });

  it("renders human labels", () => {
    expect(relativeAgeLabel("2026-07-19T11:59:40Z", base)).toBe("just now");
    expect(relativeAgeLabel("2026-07-19T11:54:00Z", base)).toBe("6 min ago");
    expect(relativeAgeLabel("2026-07-19T09:00:00Z", base)).toBe("3 h ago");
    expect(relativeAgeLabel("2026-07-17T12:00:00Z", base)).toBe("2 d ago");
  });
});
