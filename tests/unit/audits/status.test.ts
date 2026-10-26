import { describe, expect, it } from "vitest";
import { emptyFieldData } from "@/modules/audits/crux";
import { extractPage } from "@/modules/audits/html";
import { emptyResult } from "@/modules/audits/pagespeed";
import type { AuditFacts } from "@/modules/audits/rules";
import { auditHeadline, categoryStatuses, rateMetric } from "@/modules/audits/status";

const URL_ = "https://e.es/";

function facts(overrides: Partial<AuditFacts> = {}): AuditFacts {
  return {
    requestedUrl: URL_,
    httpsFailure: null,
    page: {
      kind: "fetched",
      result: { url: URL_, status: 200, contentType: "text/html", xRobotsTag: null, redirects: [], facts: extractPage("<html></html>", URL_) },
    },
    robots: null,
    sitemap: null,
    performance: emptyResult("not_configured"),
    ...overrides,
  };
}

const byCategory = (statuses: ReturnType<typeof categoryStatuses>) => Object.fromEntries(statuses.map((s) => [s.category, s]));

describe("rateMetric", () => {
  it("treats the Lighthouse score as higher-is-better", () => {
    expect(rateMetric("score", 90)).toBe("good");
    expect(rateMetric("score", 89)).toBe("needs_improvement");
    expect(rateMetric("score", 49)).toBe("poor");
  });

  it("treats timings and CLS as lower-is-better with inclusive good thresholds", () => {
    expect(rateMetric("lcp", 2500)).toBe("good");
    expect(rateMetric("tbt", 600)).toBe("needs_improvement");
    expect(rateMetric("tbt", 601)).toBe("poor");
    expect(rateMetric("speedIndex", 4200)).toBe("needs_improvement");
    expect(rateMetric("ttfb", 1801)).toBe("poor");
    expect(rateMetric("cls", 0)).toBe("good");
  });
});

describe("categoryStatuses", () => {
  it("colours each area by its most severe finding and links to the first one", () => {
    const areas = byCategory(
      categoryStatuses(
        [
          { id: "a", severity: "warning", category: "access" },
          { id: "b", severity: "critical", category: "access" },
          { id: "c", severity: "info", category: "headings" },
          { id: "d", severity: "warning", category: "crawling" },
        ],
        facts(),
      ),
    );
    expect(areas.access).toMatchObject({ tone: "bad", verdict: "Mal", count: 2, firstFindingId: "a" });
    expect(areas.crawling).toMatchObject({ tone: "fair", verdict: "Regular" });
    expect(areas.headings).toMatchObject({ tone: "info", verdict: "Mejorable" });
    expect(areas.metadata).toMatchObject({ tone: "good", verdict: "Bien", firstFindingId: null });
  });

  it("does not call an area good when it could not be checked", () => {
    const unreadable = facts({ page: { kind: "failed", failure: { kind: "dns", message: "x", url: URL_ } } });
    const areas = byCategory(categoryStatuses([], unreadable));
    expect(areas.metadata).toMatchObject({ tone: "neutral", verdict: "No comprobado" });
    expect(areas.performance).toMatchObject({ tone: "neutral" });
    expect(areas.access).toMatchObject({ tone: "good" });
    expect(byCategory(categoryStatuses([], null)).access).toMatchObject({ tone: "neutral" });
  });

  it("counts performance as checked with either lab or real-user data", () => {
    const withField = facts({ fieldData: { ...emptyFieldData("no_data"), status: "ok" } });
    expect(byCategory(categoryStatuses([], withField)).performance).toMatchObject({ tone: "good" });
    expect(byCategory(categoryStatuses([], facts())).performance).toMatchObject({ tone: "neutral" });
  });
});

describe("auditHeadline", () => {
  it("is driven by the most severe finding, never by a score", () => {
    expect(auditHeadline({ critical: 1, warning: 3, info: 0 })).toMatchObject({ tone: "bad", title: "1 problema crítico" });
    expect(auditHeadline({ critical: 0, warning: 2, info: 5 })).toMatchObject({
      tone: "fair",
      title: "Sin problemas críticos · 2 aspectos importantes",
    });
    expect(auditHeadline({ critical: 0, warning: 0, info: 1 })).toMatchObject({ tone: "good", detail: "Queda 1 mejora opcional." });
    expect(auditHeadline({ critical: 0, warning: 0, info: 0 }).title).toBe("Bien: no hemos detectado problemas");
  });
});
