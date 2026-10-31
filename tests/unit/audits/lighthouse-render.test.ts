import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LighthouseCategoryCard } from "@/components/audits/lighthouse-category";
import type { Locale } from "@/i18n/locale";
import { lighthouseView } from "@/modules/audits/lighthouse";
import { emptyResult, MAX_FAILING, type LighthouseCategory, type PerformanceResult } from "@/modules/audits/pagespeed";

const AT = new Date("2026-10-28T09:27:00Z");
const perf = (seo: LighthouseCategory): PerformanceResult => ({ ...emptyResult("ok"), score: 86, lighthouseVersion: "13.5.0", textLocale: "es", categories: { seo } });
const render = (result: PerformanceResult | null, locale: Locale = "es", version: string | null = "13.5.0") =>
  renderToStaticMarkup(createElement(LighthouseCategoryCard, { view: lighthouseView(result, "seo", locale), locale, auditedAt: result ? AT : null, version }));
const raw = { id: "unknown-check", title: "Título <b>crudo</b> de Lighthouse", score: 0 };

describe("LighthouseCategoryCard", () => {
  it("paints the score, a known check with its meaning and a raw title as plain text", () => {
    const html = render(perf({ score: 83, scored: 4, failingTotal: 2, failing: [{ id: "color-contrast", title: "x", score: 0 }, raw] }));
    expect(html).toContain("83");
    expect(html).toContain("Contraste:");
    expect(html).toContain("Título &lt;b&gt;crudo&lt;/b&gt; de Lighthouse");
    expect(html).not.toContain("<b>crudo");
    expect(html).toContain("13.5.0");
  });

  it("says how many checks did not fit in the list", () => {
    const failing = Array.from({ length: MAX_FAILING }, (_, i) => ({ ...raw, id: `unknown-${i}` }));
    expect(render(perf({ score: 20, scored: 30, failingTotal: MAX_FAILING + 3, failing }))).toContain("3");
    expect(render(perf({ score: 20, scored: 30, failingTotal: MAX_FAILING + 3, failing })).match(/<li/g)).toHaveLength(MAX_FAILING);
  });

  it("warns about Spanish titles in English and marks their language", () => {
    const html = render(perf({ score: 83, scored: 4, failingTotal: 1, failing: [raw] }), "en");
    expect(html).toContain('role="note"');
    expect(html).toContain('lang="es"');
    const spanish = render(perf({ score: 83, scored: 4, failingTotal: 1, failing: [raw] }));
    expect(spanish).not.toContain('role="note"');
    expect(spanish).not.toContain('lang="es"');
  });

  it("uses the singular when one check passes, and works without a version", () => {
    const html = render(perf({ score: 100, scored: 1, failingTotal: 0, failing: [] }), "es", null);
    expect(html).toContain("Supera la única comprobación puntuada.");
    expect(html).not.toContain("13.5.0");
  });

  it.each([
    ["no audit", null, "Todavía no hay"],
    ["an old audit", { ...emptyResult("ok"), score: 86 }, "No medido"],
  ])("explains %s without a score", (_, result, text) => {
    const html = render(result);
    expect(html).toContain(text);
    expect(html).not.toContain("/100");
  });
});
