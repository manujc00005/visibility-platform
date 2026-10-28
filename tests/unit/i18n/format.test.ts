import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDateTime, formatMs, formatNumber, formatTimestamp, regionName } from "@/i18n/format";

// 2026-10-27 12:34 UTC = 13:34 in Madrid (CET, after the October change).
const fixed = new Date("2026-10-27T12:34:56Z");

describe("formatNumber", () => {
  it("uses Spanish and British separators with each locale's default grouping (D020)", () => {
    // Same as toLocaleString("es-ES") before 003: Spanish groups from five digits.
    expect(formatNumber(1234.5, "es")).toBe("1234,5");
    expect(formatNumber(1234, "es")).toBe((1234).toLocaleString("es-ES"));
    expect(formatNumber(12345, "es")).toBe("12.345");
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(0.1, "es", { maximumFractionDigits: 3 })).toBe("0,1");
    expect(formatNumber(1000000, "en")).toBe("1,000,000");
  });
});

describe("formatDate / formatDateTime", () => {
  it("writes day-month-year in both languages", () => {
    expect(formatDate(fixed, "es")).toBe("27 oct 2026");
    expect(formatDate(fixed, "en")).toBe("27 Oct 2026");
  });

  it("adds the Madrid time", () => {
    expect(formatDateTime(fixed, "es")).toBe("27 oct 2026, 13:34");
    expect(formatDateTime(fixed, "en")).toBe("27 Oct 2026, 13:34");
  });

  it("accepts explicit options", () => {
    expect(formatDate(fixed, "en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })).toBe("27 Oct 2026");
    expect(formatDate(fixed, "es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })).toBe("27 oct 2026");
  });
});

describe("formatMs / formatBytes", () => {
  it("keeps the current Spanish output and localises the decimal separator", () => {
    expect(formatMs(null, "es")).toBe("—");
    expect(formatMs(850, "es")).toBe("850 ms");
    expect(formatMs(1740, "es")).toBe("1,7 s");
    expect(formatMs(1740, "en")).toBe("1.7 s");
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(1536, "es")).toBe("1,5 KB");
    expect(formatBytes(2.5 * 1024 * 1024, "en")).toBe("2.5 MB");
  });
});

describe("regionName", () => {
  it("names regions in the interface language", () => {
    expect(regionName("ES", "es")).toBe("España");
    expect(regionName("ES", "en")).toBe("Spain");
    expect(regionName("GB", "es")).toBe("Reino Unido");
    expect(regionName("GB", "en")).toBe("United Kingdom");
  });

  it("returns undefined for codes Intl does not name (user-assigned range)", () => {
    expect(regionName("AA", "en")).toBeUndefined();
    expect(regionName("QM", "es")).toBeUndefined();
  });
});

describe("formatTimestamp (system status card, D020)", () => {
  // Runtime time zone, as the card used before 003; fixed here so the literals pin the format.
  const previousTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    process.env.TZ = previousTz;
  });

  it("writes the runtime default date and time the card used before 003", () => {
    expect(formatTimestamp(fixed, "es")).toBe("27/10/2026, 12:34:56");
    expect(formatTimestamp(fixed, "en")).toBe("27/10/2026, 12:34:56");
  });
});
