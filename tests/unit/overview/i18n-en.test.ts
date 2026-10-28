import { describe, expect, it } from "vitest";
import { summarizeAi } from "@/modules/overview/ai";
import { buildOpportunities, overviewOriginalText } from "@/modules/overview/opportunities";
import { fieldPeriod, summarizePerformance } from "@/modules/overview/performance";
import { seoAreaStatuses, summarizeSeo, urgentChange } from "@/modules/overview/seo";
import { auditAttempt, staleInfo } from "@/modules/overview/types";
import { audit, daysAgo, facts, finding, NOW, perf, run } from "./fixtures";

/** English variants of the overview summaries (T006). Spanish behaviour stays asserted, unchanged, in the other files. */

const evaluatedRun = (outcomes: ("yes" | "no" | "none")[]) => run({ at: daysAgo(1), questions: outcomes.map((o, i) => ({ id: `p${i}`, outcomes: [o] })) });

describe("staleness and attempts in English", () => {
  it("counts days in the plural and keeps the singular available", () => {
    expect(staleInfo(daysAgo(31), NOW, "en")).toEqual({ days: 31, text: "Data from 31 days ago" });
    expect(staleInfo(daysAgo(45, 3_600_000), NOW, "en")?.text).toBe("Data from 45 days ago");
    expect(staleInfo(daysAgo(31), NOW)?.text).toBe("Datos de hace 31 días");
  });

  it("describes a running or failed newer attempt", () => {
    expect(auditAttempt(audit({ at: daysAgo(0), status: "running", facts: null }), "en")?.text).toBe("Updating: an audit is running.");
    expect(auditAttempt(audit({ at: daysAgo(0), status: "failed", facts: null }), "en")?.text).toBe("The last audit attempt did not finish. The previous result is shown.");
  });
});

describe("summarizePerformance in English", () => {
  it("translates the verdict, the change and the real-visitor line with British formats", () => {
    const a1 = audit({ at: daysAgo(2), facts: facts({ performance: perf(60) }) });
    const a2 = audit({
      at: daysAgo(1),
      facts: facts({
        performance: perf(70),
        fieldData: {
          status: "ok",
          formFactor: "PHONE",
          scope: "url",
          key: "https://e.es/",
          collectionPeriod: { firstDate: "2026-09-27", lastDate: "2026-10-24" },
          metrics: { lcpMs: 2100, inpMs: 150, cls: 0.05, fcpMs: 1200, ttfbMs: 500 },
          error: null,
        },
      }),
    });
    const s = summarizePerformance([a1, a2], [], NOW, "en");
    expect(s.verdict).toBe("Needs improvement");
    expect(s.change).toEqual({ direction: "better", text: "+10 points compared with the previous measurement" });
    expect(s.field.text).toBe("Real visitors of this page: the main content appears in 2.1 s (good).");
    expect(s.field.source).toBe("Chrome UX Report · from 27 Sept 2026 to 24 Oct 2026");
    expect(fieldPeriod({ firstDate: "2026-09-27", lastDate: "2026-10-24" })).toBe("del 27 sept 2026 al 24 oct 2026");
  });

  it("explains missing measurements and the first-audit prompt", () => {
    expect(summarizePerformance([], [], NOW, "en").reason).toBe("Run the first audit to measure the website's speed.");
    const s = summarizePerformance([audit({ at: daysAgo(1) })], [], NOW, "en");
    expect(s.verdict).toBe("Not measured");
    expect(s.reason).toBe("The PageSpeed Insights key is missing: speed is not measured.");
  });

  it("translates the top speed finding with the facts of its own audit and flags a fallback", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(40) }), rulesVersion: "2026-10-26.1" });
    const lcp = finding({ severity: "info", category: "performance", ruleId: "cls_high", title: "La página se mueve mientras carga" });
    const s = summarizePerformance([a], [lcp], NOW, "en");
    expect(s.topIssue).toBe("The page shifts while loading");
    expect(s.topIssueOriginal).toBe(false);
    const dynamic = finding({ severity: "info", category: "performance", ruleId: "lcp_slow", title: "El contenido principal tarda 3 s en aparecer en móvil" });
    const withoutLcp = summarizePerformance([a], [dynamic], NOW, "en");
    // The fixture's performance metrics have an LCP, so the dynamic title resolves from them.
    expect(withoutLcp.topIssue).toBe("The main content takes 2 s to appear on mobile");
    const unsupported = audit({ at: daysAgo(1), facts: facts({ performance: perf(40) }), rulesVersion: "r0" });
    const fallback = summarizePerformance([unsupported], [dynamic], NOW, "en");
    expect(fallback.topIssue).toBe(dynamic.title);
    expect(fallback.topIssueOriginal).toBe(true);
  });
});

describe("summarizeSeo in English", () => {
  it("translates the headline, the areas and the change with singular and plural", () => {
    const a1 = audit({ at: daysAgo(2) });
    const a2 = audit({ at: daysAgo(1) });
    const s = summarizeSeo([a1, a2], { [a1.id]: [finding({ severity: "critical", category: "metadata" })], [a2.id]: [finding({ severity: "warning", category: "metadata" })] }, NOW, "en");
    expect(s.headline?.title).toBe("No critical problems · 1 important issue");
    expect(s.change).toEqual({ direction: "same", text: "Same as in the previous audit" });
    expect(s.areas.map((x) => x.label)).toEqual(["Indexability", "Metadata", "Structure", "Sitemap and crawling", "Canonicals", "Structured data"]);
    expect(s.areas.find((x) => x.key === "metadata")).toMatchObject({ verdict: "Fair", count: 1 });
    expect(s.areas.find((x) => x.key === "structure")?.verdict).toBe("Good");
    expect(urgentChange({ critical: 0, warning: 0, info: 0 }, { critical: 1, warning: 0, info: 0 }, "en").text).toBe("1 problem fewer than in the previous audit");
    expect(urgentChange({ critical: 1, warning: 2, info: 0 }, { critical: 0, warning: 0, info: 0 }, "en").text).toBe("3 new problems since the previous audit");
  });

  it("keeps the partial result honest and marks unchecked areas", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ readable: false }) });
    const s = summarizeSeo([a], { [a.id]: [] }, NOW, "en");
    expect(s.headline?.title).toBe("Partial result");
    expect(s.reason).toBe("Partial result: the home page could not be read, so only access, robots.txt and the sitemap were checked.");
    expect(seoAreaStatuses([], a.facts, "en").find((x) => x.key === "metadata")?.verdict).toBe("Not checked");
  });
});

describe("summarizeAi in English", () => {
  it("translates reasons with singular and plural", () => {
    expect(summarizeAi([], 0, NOW, "en").reason).toBe("Add questions your customers might ask to start measuring.");
    const one = summarizeAi([evaluatedRun(["yes", "none"])], 2, NOW, "en");
    expect(one.reason).toBe("Partial result: 1 question got no valid answer.");
    const several = summarizeAi([evaluatedRun(["yes", "none", "none"])], 3, NOW, "en");
    expect(several.reason).toBe("Partial result: 2 questions got no valid answer.");
    expect(several.setupNotice).toBeNull();
    expect(summarizeAi([evaluatedRun(["yes"])], 0, NOW, "en").setupNotice).toBe("There are no active questions: add questions to prepare a new measurement.");
  });

  it("compares runs with the English note", () => {
    const first = run({ at: daysAgo(2), key: "k1", questions: [{ id: "p0", outcomes: ["no"] }] });
    const second = run({ at: daysAgo(1), key: "k2", questions: [{ id: "p0", outcomes: ["yes"] }] });
    expect(summarizeAi([first, second], 1, NOW, "en").comparisonNote).toBe("No comparison: the previous measurement used another configuration.");
  });
});

describe("buildOpportunities in English", () => {
  function build(auditInput: ReturnType<typeof audit>, findings: ReturnType<typeof finding>[], runs: ReturnType<typeof run>[] = [], activePrompts = 0, context?: { facts: ReturnType<typeof facts> | null; rulesVersion: string | null }) {
    const byAudit = { [auditInput.id]: findings };
    return buildOpportunities(
      {
        findings,
        seo: summarizeSeo([auditInput], byAudit, NOW, "en"),
        performance: summarizePerformance([auditInput], findings, NOW, "en"),
        ai: summarizeAi(runs, activePrompts, NOW, "en"),
        context,
      },
      "en",
    );
  }

  it("translates a dynamic finding with the facts of its own audit", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }), rulesVersion: "2026-10-26.1" });
    const f = finding({ severity: "warning", category: "metadata", ruleId: "title_too_short", title: "El título es muy corto (1 caracteres)", recommendation: "Usa un título descriptivo con tu actividad y tu zona." });
    const list = build(a, [f], [evaluatedRun(["yes"])], 1, { facts: a.facts, rulesVersion: a.rulesVersion ?? null });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.storedEvidenceFrom).toBe(0);
    expect(list.items[0]).toMatchObject({
      kind: "metadata",
      title: "Optimise the title and description",
      // The fixture page has a one-character <title>, so the length comes from the stored facts.
      problem: "The title is very short (1 characters)",
      action: "Use a descriptive title with your activity and your area.",
      sourceLabel: "Technical audit of the home page",
      original: false,
    });
    expect(list.evidence).toBe("complete");
  });

  it("keeps the stored Spanish texts, flagged, when the context is missing", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) });
    const f = finding({ severity: "warning", category: "metadata", ruleId: "title_too_short", title: "El título es muy corto (1 caracteres)", recommendation: "Usa un título descriptivo." });
    const list = build(a, [f]);
    expect(list.items[0]).toMatchObject({ problem: f.title, action: f.recommendation, original: true });
    expect(list.pending).toEqual(["AI presence is not set up."]);
  });

  it("translates the speed and AI opportunities and the pending list", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(40) }), rulesVersion: "2026-10-26.1" });
    const list = build(a, [], [evaluatedRun(["no", "yes"])], 2, { facts: a.facts, rulesVersion: "2026-10-26.1" });
    expect(list.items.map((o) => o.kind)).toEqual(["speed", "ai_coverage"]);
    expect(list.items[0]).toMatchObject({
      title: "Improve mobile speed",
      problem: "The home page scores 40/100 for mobile performance.",
      evidence: ["Mobile performance: 40/100 (poor)"],
      sourceLabel: "PageSpeed Insights · mobile lab test",
      original: false,
    });
    expect(list.items[1]).toMatchObject({
      problem: "ChatGPT did not mention you in 1 of the 2 questions evaluated.",
      evidence: ["Not mentioned: “Pregunta p0”"],
    });
    // Which evidence lines are stored (Spanish) and which are written in the interface language.
    expect(list.items[0]!.storedEvidenceFrom).toBe(1);
    expect(list.items[1]!.storedEvidenceFrom).toBeGreaterThanOrEqual(list.items[1]!.evidence.length);
    const partial = build(audit({ at: daysAgo(1) }), []);
    expect(partial.pending).toEqual(["Speed has not been measured yet.", "AI presence is not set up."]);
  });
});

describe("overviewOriginalText (single notice, AC-009)", () => {
  it("asks for the fallback notice when only the performance card shows a stored Spanish problem", () => {
    // Unsupported rules version: the dynamic LCP title keeps its stored text; score 95 → no speed opportunity.
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }), rulesVersion: "r0" });
    const dynamic = finding({ severity: "info", category: "performance", ruleId: "lcp_slow", title: "El contenido principal tarda 3 s en aparecer en móvil" });
    const performance = summarizePerformance([a], [dynamic], NOW, "en");
    const list = buildOpportunities(
      { findings: [dynamic], seo: summarizeSeo([a], { [a.id]: [dynamic] }, NOW, "en"), performance, ai: summarizeAi([], 0, NOW, "en"), context: { facts: a.facts, rulesVersion: "r0" } },
      "en",
    );
    expect(list.items).toEqual([]);
    expect(performance.topIssueOriginal).toBe(true);
    expect(overviewOriginalText(list, performance)).toEqual({ storedEvidence: false, fallback: true });
  });

  it("asks for nothing when everything shown is translated and no evidence is stored", () => {
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }), rulesVersion: "2026-10-26.1" });
    const performance = summarizePerformance([a], [], NOW, "en");
    const list = buildOpportunities({ findings: [], seo: summarizeSeo([a], { [a.id]: [] }, NOW, "en"), performance, ai: summarizeAi([], 0, NOW, "en") }, "en");
    expect(overviewOriginalText(list, performance)).toEqual({ storedEvidence: false, fallback: false });
  });
});

