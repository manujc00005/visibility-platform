import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/messages";

const params = (repetitions: number) => ({
  domain: "olessium.com",
  when: "25 oct 2026, 22:01",
  provider: "Manual",
  status: "Completada",
  location: "Spain",
  language: "es",
  repetitions,
  methodology: "geo-2026-10-25.1",
});

// Before 003 the run page wrote `${repetitions} repetición(es)` for any count; Spanish stays identical (D007, D020).
describe("GEO run page meta line", () => {
  it("keeps the original Spanish «repetición(es)» for one and several repetitions", () => {
    const meta = getMessages("es").geo.run.meta;
    expect(meta(params(1))).toBe("olessium.com · 25 oct 2026, 22:01 · Manual · Completada · Spain, es · 1 repetición(es) · metodología geo-2026-10-25.1");
    expect(meta(params(3))).toContain("· 3 repetición(es) ·");
  });

  it("uses singular and plural in English", () => {
    const meta = getMessages("en").geo.run.meta;
    expect(meta(params(1))).toContain("· 1 repetition ·");
    expect(meta(params(3))).toContain("· 3 repetitions ·");
  });
});
