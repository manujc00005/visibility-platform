import { describe, expect, it } from "vitest";
import { seoHistoryPoints, summarizeSeo } from "@/modules/overview/seo";
import { audit, daysAgo, facts, finding, NOW, perf } from "./fixtures";

describe("summarizeSeo", () => {
  it("counts only SEO findings: a performance-only change leaves SEO untouched (AC-014)", () => {
    const a1 = audit({ at: daysAgo(2), facts: facts({ performance: perf(90) }) });
    const a2 = audit({ at: daysAgo(1), facts: facts({ performance: perf(20) }) });
    const meta = () => finding({ severity: "warning", category: "metadata", ruleId: "description_missing" });
    const s = summarizeSeo([a1, a2], { [a1.id]: [meta()], [a2.id]: [meta(), finding({ severity: "warning", category: "performance" }), finding({ severity: "warning", category: "performance" })] }, NOW);
    expect(s.counts).toEqual({ critical: 0, warning: 1, info: 0 });
    expect(s.change?.direction).toBe("same");
    expect(s.headline?.title).toMatch(/1 aspecto importante/);
  });

  it("reports fewer problems as better with equal coverage", () => {
    const a1 = audit({ at: daysAgo(2) });
    const a2 = audit({ at: daysAgo(1) });
    const s = summarizeSeo([a1, a2], { [a1.id]: [finding({ severity: "critical", category: "metadata" }), finding({ severity: "warning", category: "headings" })], [a2.id]: [] }, NOW);
    expect(s.change).toEqual({ direction: "better", text: "2 problemas menos que en la auditoría anterior" });
  });

  it("does not compare different, unknown or unloaded coverage (AC-014)", () => {
    const unread = audit({ at: daysAgo(2), facts: facts({ readable: false }) });
    const read = audit({ at: daysAgo(1) });
    const differentPage = summarizeSeo([unread, read], { [unread.id]: [finding({ severity: "critical", category: "access" })], [read.id]: [] }, NOW);
    expect(differentPage.change).toBeNull();
    expect(differentPage.comparisonNote).toMatch(/cosas distintas/);

    const oldRules = audit({ at: daysAgo(2), rulesVersion: "r0" });
    const s2 = audit({ at: daysAgo(1) });
    expect(summarizeSeo([oldRules, s2], { [oldRules.id]: [], [s2.id]: [] }, NOW).change).toBeNull();

    const unknown = audit({ at: daysAgo(2), rulesVersion: null });
    const s3 = audit({ at: daysAgo(1) });
    expect(summarizeSeo([unknown, s3], { [unknown.id]: [], [s3.id]: [] }, NOW).change).toBeNull();

    const p = audit({ at: daysAgo(2) });
    const l = audit({ at: daysAgo(1) });
    expect(summarizeSeo([p, l], { [l.id]: [] }, NOW).change).toBeNull();
  });

  it("never presents an unread home page as positive (AC-013)", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ readable: false }) });
    const s = summarizeSeo([a], { [a.id]: [] }, NOW);
    expect(s.state).toBe("partial");
    expect(s.tone).toBe("neutral");
    expect(s.headline?.title).toBe("Resultado parcial");
    expect(s.areas.find((x) => x.key === "metadata")?.verdict).toBe("No comprobado");
    expect(s.areas.find((x) => x.key === "structured_data")?.verdict).toBe("No comprobado");
  });

  it("builds six areas with canonicals on their own tile", () => {
    const a = audit({ at: daysAgo(1) });
    const s = summarizeSeo([a], { [a.id]: [finding({ severity: "warning", category: "indexability", ruleId: "canonical_missing" })] }, NOW);
    expect(s.areas.map((x) => x.key)).toEqual(["indexability", "metadata", "structure", "sitemap", "canonicals", "structured_data"]);
    expect(s.areas.find((x) => x.key === "canonicals")).toMatchObject({ verdict: "Regular", count: 1 });
    expect(s.areas.find((x) => x.key === "indexability")?.verdict).toBe("Bien");
  });

  it("keeps the dated result and flags the newer attempt (AC-013)", () => {
    const a = audit({ at: daysAgo(31) });
    const s = summarizeSeo([a, audit({ at: daysAgo(0), status: "failed", facts: null })], { [a.id]: [] }, NOW);
    expect(s.state).toBe("ok");
    expect(s.auditedAt).toEqual(a.startedAt);
    expect(s.attempt?.status).toBe("failed");
    expect(s.stale?.days).toBe(31);
  });

  it("never shows a positive result when the findings of the result could not be loaded", () => {
    const a = audit({ at: daysAgo(1) });
    const s = summarizeSeo([a], {}, NOW);
    expect(s.state).toBe("error");
    expect(s.headline).toBeNull();
    expect(s.tone).toBe("neutral");
  });

  it("shows analyzing, error or no data without a result", () => {
    expect(summarizeSeo([], {}, NOW).state).toBe("no_data");
    expect(summarizeSeo([audit({ at: daysAgo(0), status: "running", facts: null })], {}, NOW).state).toBe("analyzing");
    expect(summarizeSeo([audit({ at: daysAgo(0), status: "failed", facts: null })], {}, NOW).state).toBe("error");
  });
});

describe("seoHistoryPoints", () => {
  it("excludes performance in every point, oldest first, skipping unloaded audits (AC-014)", () => {
    const a1 = audit({ at: daysAgo(3) });
    const a2 = audit({ at: daysAgo(2) });
    const a3 = audit({ at: daysAgo(1), criticalCount: 9 });
    const points = seoHistoryPoints([a3, a1, a2], {
      [a1.id]: [finding({ severity: "warning", category: "performance" }), finding({ severity: "info", category: "social" })],
      [a3.id]: [finding({ severity: "critical", category: "metadata" })],
    });
    expect(points.map((p) => p.id)).toEqual([a1.id, a3.id]);
    expect(points[0]!.counts).toEqual({ critical: 0, warning: 0, info: 1 });
    expect(points[1]!.counts).toEqual({ critical: 1, warning: 0, info: 0 });
    expect(points.every((p) => p.score === null)).toBe(true);
  });
});
