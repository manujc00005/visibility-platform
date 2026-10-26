import { describe, expect, it } from "vitest";
import { formatMicros, parseUsdToMicros, usdFloatToMicros } from "@/modules/geo/budget";

describe("money in exact micro-USD", () => {
  it("parses decimal strings exactly", () => {
    expect(parseUsdToMicros("5")).toBe(5_000_000);
    expect(parseUsdToMicros("0.0012")).toBe(1_200);
    expect(parseUsdToMicros("0.1")).toBe(100_000);
    expect(parseUsdToMicros(" 12.345678 ")).toBe(12_345_678);
  });

  it("represents sub-cent prices that integer cents cannot (Codex B04)", () => {
    expect(parseUsdToMicros("0.0012")! * 75).toBe(90_000); // 75 tasks = 0.09 USD exactly
    // Accumulating costs is where floats drift: five charges of 0.0012 USD.
    let floatSum = 0;
    let microSum = 0;
    for (let i = 0; i < 5; i++) {
      floatSum += 0.0012;
      microSum += parseUsdToMicros("0.0012")!;
    }
    expect(floatSum).not.toBe(0.006);
    expect(microSum).toBe(6_000);
  });

  it("rejects anything that is not a plain non-negative decimal (fail-closed)", () => {
    for (const bad of [undefined, null, "", "abc", "-1", "1e3", "1,5", "0.0000001", "1.2.3", "Infinity"]) {
      expect(parseUsdToMicros(bad)).toBeNull();
    }
  });

  it("rounds provider float costs once to the nearest micro-USD", () => {
    expect(usdFloatToMicros(0.0012)).toBe(1_200);
    expect(usdFloatToMicros(0.0024000000000000002)).toBe(2_400);
    expect(usdFloatToMicros(-1)).toBeNull();
    expect(usdFloatToMicros("0.0012")).toBeNull();
    expect(usdFloatToMicros(Number.NaN)).toBeNull();
  });

  it("formats for display", () => {
    expect(formatMicros(90_000)).toBe("0,09 USD");
    expect(formatMicros(1_200)).toBe("0,0012 USD");
  });
});
