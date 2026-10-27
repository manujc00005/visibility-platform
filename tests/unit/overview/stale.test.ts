import { describe, expect, it } from "vitest";
import { isStale, staleInfo } from "@/modules/overview/types";
import { daysAgo, NOW } from "./fixtures";

describe("staleness (AC-007, AC-015)", () => {
  it("does not warn at exactly 30 days", () => {
    expect(isStale(daysAgo(30), NOW)).toBe(false);
    expect(staleInfo(daysAgo(30), NOW)).toBeNull();
  });

  it("warns past 30 × 24 hours and counts whole days", () => {
    expect(staleInfo(daysAgo(30, 1), NOW)).toEqual({ days: 30, text: "Datos de hace 30 días" });
    expect(staleInfo(daysAgo(45, 3_600_000), NOW)?.days).toBe(45);
  });

  it("has nothing to say without a result", () => {
    expect(staleInfo(null, NOW)).toBeNull();
  });
});
