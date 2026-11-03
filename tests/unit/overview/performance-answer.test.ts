import { describe, expect, it } from "vitest";
import type { FieldDataResult } from "@/modules/audits/crux";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import { performanceAnswer } from "@/modules/overview/performance-answer";
import { emptyFieldData, emptyResult, perf } from "./fixtures";

const lab = (lcpMs: number): PerformanceResult => ({ ...perf(40), metrics: { lcpMs, cls: 0, tbtMs: 50, fcpMs: 900, speedIndexMs: 1500 } });
const field = (lcpMs: number | null, inpMs: number | null = 100, cls: number | null = 0.01): FieldDataResult => ({
  ...emptyFieldData("ok"),
  scope: "url",
  metrics: { lcpMs, inpMs, cls, fcpMs: null, ttfbMs: null },
});

describe("performanceAnswer", () => {
  it("leads with real visitors and then gives the lab result", () => {
    expect(performanceAnswer(lab(4300), field(1700))).toBe(
      "Tus visitantes reales ven tu web rápida; en la prueba exigente de Google, el contenido principal tarda 4,3 s.",
    );
  });

  it("says the lab test agrees when both point the same way", () => {
    expect(performanceAnswer(lab(1200), field(1700))).toMatch(/rápida, y la prueba de Google coincide: .* 1,2 s\.$/);
    expect(performanceAnswer(lab(6000), field(5000))).toMatch(/lenta, y la prueba de Google coincide/);
  });

  it("judges visitors by their worst metric", () => {
    expect(performanceAnswer(lab(1200), field(1700, 600))).toMatch(/^Tus visitantes reales ven tu web lenta/);
    expect(performanceAnswer(undefined, field(1700, null, 0.2))).toBe("Tus visitantes reales ven tu web con margen de mejora.");
  });

  it("does not call the lab test demanding when it is better than the visitors", () => {
    const text = performanceAnswer(lab(1200), field(5000));
    expect(text).not.toMatch(/exigente/);
    expect(text).toMatch(/lenta; en la prueba de Google/);
  });

  it("describes only the lab result when there is no field data", () => {
    expect(performanceAnswer(lab(4300), emptyFieldData("no_data"))).toBe("Según la prueba de Google en un móvil simulado, el contenido principal tarda 4,3 s.");
    expect(performanceAnswer(lab(4300), undefined)).toMatch(/4,3 s/);
  });

  it("describes only the visitors when the lab test was not measured", () => {
    expect(performanceAnswer(emptyResult("quota_exceeded"), field(1700))).toBe("Tus visitantes reales ven tu web rápida.");
  });

  it("returns null when nothing was measured", () => {
    expect(performanceAnswer(emptyResult("not_configured"), emptyFieldData("no_data"))).toBeNull();
    expect(performanceAnswer(undefined, undefined)).toBeNull();
  });

  it("speaks English when asked", () => {
    expect(performanceAnswer(lab(4300), field(1700), "en")).toBe("Your real visitors find your website fast; in Google's demanding test, the main content takes 4.3 s.");
  });
});
