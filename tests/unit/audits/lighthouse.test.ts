import { describe, expect, it } from "vitest";
import { lighthouseView } from "@/modules/audits/lighthouse";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";

const measured = (overrides: Partial<PerformanceResult> = {}): PerformanceResult => ({
  ...emptyResult("ok"),
  score: 86,
  lighthouseVersion: "13.5.0",
  textLocale: "es",
  categories: {
    seo: { score: 83, scored: 4, failingTotal: 1, failing: [{ id: "meta-description", title: "El documento no tiene una metadescripción", score: 0 }] },
    accessibility: { score: 100, scored: 20, failingTotal: 0, failing: [] },
    "best-practices": { score: 42, scored: 10, failingTotal: 0, failing: [] },
  },
  ...overrides,
});

describe("lighthouseView", () => {
  it("rates the score with the existing thresholds", () => {
    expect(lighthouseView(measured(), "accessibility")).toMatchObject({ state: "ok", score: 100, tone: "good", verdict: "Bueno" });
    expect(lighthouseView(measured(), "seo")).toMatchObject({ state: "ok", score: 83, tone: "fair", verdict: "Mejorable", failingTotal: 1 });
    expect(lighthouseView(measured(), "best-practices")).toMatchObject({ tone: "bad", verdict: "Malo" });
  });

  it("treats a category without scored checks as unscored, not as a measured zero", () => {
    const perf = measured({ categories: { seo: { score: 0, scored: 0, failingTotal: 0, failing: [] } } });
    expect(lighthouseView(perf, "seo")).toMatchObject({ state: "unavailable", score: null });
  });

  it("drops the markdown backticks of Lighthouse titles", () => {
    const perf = measured({ categories: { seo: { score: 50, scored: 2, failingTotal: 1, failing: [{ id: "unknown-check", title: "El elemento `<html>` no tiene `[lang]`", score: 0 }] } } });
    expect(lighthouseView(perf, "seo").failing[0]?.title).toBe("El elemento <html> no tiene [lang]");
  });

  it("never shows an old audit as zero", () => {
    const old = measured({ categories: undefined, textLocale: undefined });
    expect(lighthouseView(old, "seo")).toMatchObject({ state: "not_measured", score: null, verdict: "No medido" });
  });

  it("explains a missing audit, a failed PageSpeed run and an unscored category", () => {
    expect(lighthouseView(undefined, "seo")).toMatchObject({ state: "no_audit", reason: "Todavía no hay auditorías." });
    expect(lighthouseView(emptyResult("quota_exceeded"), "seo")).toMatchObject({
      state: "unavailable",
      reason: "La cuota de PageSpeed Insights estaba agotada en la última auditoría.",
    });
    const unscored = measured({ categories: { seo: { score: null, scored: 0, failingTotal: 0, failing: [] } } });
    expect(lighthouseView(unscored, "seo").state).toBe("unavailable");
    expect(lighthouseView(unscored, "accessibility").state).toBe("unavailable");
  });

  it("translates the verdict and flags Spanish check titles in English", () => {
    expect(lighthouseView(measured(), "seo", "en")).toMatchObject({ verdict: "Needs improvement", originalTexts: true });
    expect(lighthouseView(measured(), "seo", "es").originalTexts).toBe(false);
    // Nothing to flag when nothing failed.
    expect(lighthouseView(measured(), "accessibility", "en").originalTexts).toBe(false);
    expect(lighthouseView(measured({ categories: undefined }), "seo", "en").reason).toBe("The latest audit predates this check. Run a new audit to measure it.");
  });

  it("names contrast and heading order in our own words, in both languages", () => {
    const accessibility = {
      score: 84,
      scored: 20,
      failingTotal: 3,
      failing: [
        { id: "color-contrast", title: "Los colores de fondo y de primer plano no tienen una relación de contraste adecuada", score: 0 },
        { id: "heading-order", title: "Los elementos de encabezado no aparecen en orden descendente", score: 0 },
        { id: "image-alt", title: "Los elementos de imagen no tienen atributos [alt]", score: 0 },
      ],
    };
    const perf = measured({ categories: { accessibility } });
    expect(lighthouseView(perf, "accessibility", "es").failing).toEqual([
      { id: "color-contrast", title: "Contraste", meaning: "El color del texto y el del fondo no contrastan lo suficiente." },
      { id: "heading-order", title: "Encabezados", meaning: "Los títulos no siguen un orden descendente." },
      { id: "image-alt", title: "Los elementos de imagen no tienen atributos [alt]", meaning: null },
    ]);
    const en = lighthouseView(perf, "accessibility", "en");
    expect(en.failing.slice(0, 2)).toEqual([
      { id: "color-contrast", title: "Contrast", meaning: "The text and background colors do not contrast enough." },
      { id: "heading-order", title: "Headings", meaning: "The headings are not in descending order." },
    ]);
    // The untranslated check still flags its Spanish title...
    expect(en.originalTexts).toBe(true);
    // ...but with only known checks there is nothing in Spanish to flag.
    const known = measured({ categories: { accessibility: { ...accessibility, failingTotal: 2, failing: accessibility.failing.slice(0, 2) } } });
    expect(lighthouseView(known, "accessibility", "en").originalTexts).toBe(false);
  });

  it("does not read inherited object keys as check names", () => {
    const perf = measured({ categories: { seo: { score: 90, scored: 4, failingTotal: 1, failing: [{ id: "toString", title: "Original", score: 0 }] } } });
    expect(lighthouseView(perf, "seo", "en").failing).toEqual([{ id: "toString", title: "Original", meaning: null }]);
  });
});
