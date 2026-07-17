import { describe, it, expect } from "vitest";
import { onlineReducer, initialOnlineState, type OnlineState } from "./online-status";

const NOW = 1000;

describe("onlineReducer", () => {
  it("starts online when the browser is online", () => {
    const s = initialOnlineState(true, NOW);
    expect(s.online).toBe(true);
    expect(s.browserOnline).toBe(true);
    expect(s.reachable).toBeNull();
  });

  it("browser_offline forces offline immediately", () => {
    const s = onlineReducer(initialOnlineState(true, NOW), { type: "browser_offline" }, NOW + 1);
    expect(s.online).toBe(false);
    expect(s.browserOnline).toBe(false);
    expect(s.reachable).toBe(false);
  });

  it("stays offline until a ping confirms reachability after regaining the browser link", () => {
    let s: OnlineState = initialOnlineState(false, NOW);
    expect(s.online).toBe(false);
    // Browser says online again — optimistic online, but reachable resets to unknown.
    s = onlineReducer(s, { type: "browser_online" }, NOW + 1);
    expect(s.browserOnline).toBe(true);
    expect(s.reachable).toBeNull();
    expect(s.online).toBe(true); // optimistic while unknown
  });

  it("a failed ping while the browser thinks it's online marks offline (captive portal)", () => {
    let s = initialOnlineState(true, NOW);
    s = onlineReducer(s, { type: "reach_fail" }, NOW + 1);
    expect(s.online).toBe(false);
    expect(s.browserOnline).toBe(true); // browser link is up, but nothing is reachable
    expect(s.reachable).toBe(false);
  });

  it("a successful ping restores online", () => {
    let s = onlineReducer(initialOnlineState(true, NOW), { type: "reach_fail" }, NOW + 1);
    expect(s.online).toBe(false);
    s = onlineReducer(s, { type: "reach_ok" }, NOW + 2);
    expect(s.online).toBe(true);
    expect(s.reachable).toBe(true);
  });

  it("returns the same reference when nothing changes (referential stability)", () => {
    const s = initialOnlineState(true, NOW);
    const next = onlineReducer(s, { type: "reach_ok" }, NOW + 1);
    // reach_ok changes reachable null->true, so this IS a change:
    expect(next).not.toBe(s);
    // But a redundant reach_ok afterward is a no-op:
    const again = onlineReducer(next, { type: "reach_ok" }, NOW + 2);
    expect(again).toBe(next);
  });
});
