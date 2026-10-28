import { describe, expect, it } from "vitest";
import { parseApiKey } from "@/modules/bing-webmaster/credentials";

const KEY = "EEDECC1EA4AE341CC57365E075EBC8B6";

describe("parseApiKey", () => {
  it("returns null when nothing is configured", () => {
    expect(parseApiKey(undefined)).toBeNull();
    expect(parseApiKey("")).toBeNull();
    expect(parseApiKey("   ")).toBeNull();
  });

  it("accepts an alphanumeric key and trims it", () => {
    expect(parseApiKey(KEY)).toEqual({ ok: true, value: KEY });
    expect(parseApiKey(`  ${KEY}\n`)).toEqual({ ok: true, value: KEY });
  });

  it("rejects values that could alter the request URL or are not a key, without echoing them", () => {
    const cases = [`${KEY}&siteUrl=x`, `${KEY} x`, "short1", "a".repeat(129), `${KEY}#`, `${KEY}/`, "clé-ÄÖ0123456789abcdef"];
    for (const raw of cases) {
      const parsed = parseApiKey(raw);
      expect(parsed).toEqual({ ok: false, reason: "bad_format" });
      expect(JSON.stringify(parsed)).not.toContain(raw);
    }
  });

  it("accepts the length bounds", () => {
    expect(parseApiKey("a".repeat(16))?.ok).toBe(true);
    expect(parseApiKey("a".repeat(128))?.ok).toBe(true);
    expect(parseApiKey("a".repeat(15))?.ok).toBe(false);
  });
});
