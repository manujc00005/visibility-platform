import { describe, expect, it } from "vitest";
import { summarizeAi } from "@/modules/overview/ai";
import { buildOpportunities } from "@/modules/overview/opportunities";
import { summarizePerformance } from "@/modules/overview/performance";
import { summarizeSeo } from "@/modules/overview/seo";
import type { AuditInput, FindingLike } from "@/modules/overview/types";
import type { SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { summarizeSearchConsole, type SearchConsoleSummary } from "@/modules/search-console/summary";
import { audit, daysAgo, emptyFieldData, facts, finding, NOW, perf, run } from "./fixtures";

const fastVisitors = { ...emptyFieldData("ok"), scope: "url" as const, metrics: { lcpMs: 1700, inpMs: 100, cls: 0.01, fcpMs: null, ttfbMs: null } };

function build(audits: AuditInput[], findings: FindingLike[], runs: ReturnType<typeof run>[] = [], activePrompts = 0, gsc?: SearchConsoleSummary, locale?: "en") {
  const latest = audits.find((a) => a.status === "completed");
  const byAudit = latest ? { [latest.id]: findings } : {};
  return buildOpportunities(
    {
      findings,
      seo: summarizeSeo(audits, byAudit, NOW, locale),
      performance: summarizePerformance(audits, findings, NOW, locale),
      ai: summarizeAi(runs, activePrompts, NOW, locale),
      gsc,
    },
    locale,
  );
}

const zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
function snapshot(overrides: Partial<SearchConsoleSnapshot> = {}): SearchConsoleSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "google_gsc",
    captureCondition: "owner_api",
    property: "sc-domain:olessium.com",
    currentStart: "2026-09-27",
    currentEnd: "2026-10-24",
    previousStart: "2026-08-30",
    previousEnd: "2026-09-26",
    totals: { clicks: 12, impressions: 400, ctr: 0.03, position: 9.4 },
    previousTotals: { clicks: 8, impressions: 390, ctr: 0.0205, position: 12.1 },
    queries: [],
    pages: [],
    segments: null,
    keywordSeries: null,
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    createdAt: daysAgo(1),
    ...overrides,
  };
}
const READY = { state: "ready" as const, clientEmail: "visibility@demo.iam.gserviceaccount.com" };
const gscOf = (latest: SearchConsoleSnapshot | null, config: Parameters<typeof summarizeSearchConsole>[1] = READY, locale?: "en") =>
  summarizeSearchConsole({ latest, latestCompleted: latest?.status === "completed" ? latest : null }, config, "olessium.com", locale);

const evaluatedRun = (outcomes: ("yes" | "no" | "none")[]) => run({ at: daysAgo(1), questions: outcomes.map((o, i) => ({ id: `p${i}`, outcomes: [o] })) });

describe("buildOpportunities (AC-006)", () => {
  it("cannot recommend anything without usable results", () => {
    const list = build([], []);
    expect(list.items).toEqual([]);
    expect(list.evidence).toBe("none");
  });

  it("declares the limits when some block is unmeasured", () => {
    const list = build([audit({ at: daysAgo(1) })], []);
    expect(list.evidence).toBe("partial");
    expect(list.pending).toEqual(["La velocidad todavía no se ha medido.", "La presencia en IA no está configurada."]);
  });

  it("makes a lab-only speed problem a low priority when real visitors find the site fast", () => {
    const findings = [
      finding({ severity: "warning", category: "metadata", ruleId: "description_missing" }),
      finding({ severity: "warning", category: "performance", ruleId: "lcp_slow" }),
    ];
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(40), fieldData: fastVisitors }) });
    const list = build([a], findings);
    expect(list.items.map((o) => [o.kind, o.priority])).toEqual([
      ["metadata", "medium"],
      ["speed", "low"],
    ]);
    // The evidence keeps the lab score's own word, not the visitors' verdict.
    expect(list.items[1].evidence[0]).toBe("Rendimiento móvil: 40/100 (malo)");
  });

  it("says no priority problems only when SEO, speed and AI were all measured", () => {
    const list = build([audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) })], [], [evaluatedRun(["yes", "yes"])], 2);
    expect(list.evidence).toBe("complete");
    expect(list.items).toEqual([]);
  });

  it("keeps at most three, one per kind, highest priority first, each with evidence, source and date", () => {
    const findings = [
      finding({ severity: "critical", category: "metadata", ruleId: "title_missing", title: "La página no tiene título" }),
      finding({ severity: "warning", category: "metadata", ruleId: "description_missing" }),
      finding({ severity: "warning", category: "crawling", ruleId: "sitemap_missing" }),
      finding({ severity: "info", category: "structured_data", ruleId: "structured_data_missing" }),
      finding({ severity: "warning", category: "performance", ruleId: "lcp_slow" }),
    ];
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(40) }) });
    const list = build([a], findings, [evaluatedRun(["no"])], 1);
    expect(list.items.map((o) => o.kind)).toEqual(["metadata", "speed", "sitemap"]);
    expect(list.items.map((o) => o.priority)).toEqual(["high", "high", "medium"]);
    for (const o of list.items) {
      expect(o.evidence.length).toBeGreaterThan(0);
      expect(o.sourceLabel).not.toBe("");
      expect(o.measuredAt).toEqual(a.startedAt);
    }
    expect(list.items[0]!.problem).toBe("La página no tiene título");
    expect(list.items[0]!.href).toBe(`/seo#finding-${findings[0]!.id}`);
  });

  it("says how many findings each opportunity stands for, so the card counts and the list agree", () => {
    const findings = [
      finding({ severity: "critical", category: "metadata", ruleId: "title_missing" }),
      finding({ severity: "warning", category: "metadata", ruleId: "description_missing" }),
      finding({ severity: "warning", category: "crawling", ruleId: "sitemap_missing" }),
    ];
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(40) }) });
    const list = build([a], findings);
    expect(list.items.map((o) => [o.kind, o.covers])).toEqual([
      ["metadata", 2],
      ["speed", 1],
      ["sitemap", 1],
    ]);
  });

  it("ignores optional SEO improvements and access warnings", () => {
    const list = build(
      [audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) })],
      [finding({ severity: "info", category: "metadata", ruleId: "title_too_long" }), finding({ severity: "warning", category: "access", ruleId: "cross_host_redirect" })],
    );
    expect(list.items).toEqual([]);
  });

  it("suggests reviewing AI questions only for evaluated questions without mention, with explicit uncertainty", () => {
    const list = build([audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) })], [], [evaluatedRun(["no", "yes", "none"])], 3);
    expect(list.items).toHaveLength(1);
    const ai = list.items[0]!;
    expect(ai.kind).toBe("ai_coverage");
    expect(ai.problem).toBe("ChatGPT no te mencionó en 1 de las 2 preguntas evaluadas.");
    expect(ai.evidence).toEqual(["Sin mención: «Pregunta p0»"]);
    expect(ai.action).toMatch(/no demuestra que falte contenido/);
    expect(list.evidence).toBe("partial");
  });

  it("creates no AI opportunity from questions without a valid answer", () => {
    const list = build([audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) })], [], [evaluatedRun(["yes", "none"])], 2);
    expect(list.items).toEqual([]);
  });

  it("never claims that structured data guarantees AI presence", () => {
    const list = build([audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) })], [finding({ severity: "info", category: "structured_data", ruleId: "structured_data_missing" })]);
    expect(list.items[0]!.priority).toBe("low");
    expect(list.items[0]!.why).toMatch(/No garantizan/);
  });
});

describe("buildOpportunities: Google does not show the website (feature 024)", () => {
  const clean = () => audit({ at: daysAgo(1), facts: facts({ performance: perf(95) }) });
  const empty = () => gscOf(snapshot({ totals: zero, previousTotals: zero }));

  it("turns zero impressions in both periods into a medium opportunity with what was measured (AC-001)", () => {
    const list = build([clean()], [], [], 0, empty());
    const o = list.items.find((i) => i.kind === "search_visibility");
    expect(o).toBeDefined();
    expect(o!.priority).toBe("medium");
    expect(o!.title).toBe("Comprobar si Google tiene tu web en su índice");
    expect(o!.problem).toBe("Google no ha mostrado tu web en sus resultados en ninguno de los dos periodos medidos.");
    expect(o!.action).toBe("Comprobar en Search Console, en el informe de indexación de páginas, si Google tiene indexadas las páginas de tu web.");
    expect(o!.evidence).toEqual(["Search Console: 0 impresiones del 27 sept 2026 al 24 oct 2026 y 0 en los 28 días anteriores."]);
    expect(o!.sourceLabel).toBe("Search Console");
    expect(o!.measuredAt).toEqual(daysAgo(1));
    expect(o!.href).toBe("/seo#results-title");
    expect(o!.covers).toBe(1);
    expect(list.items.some((i) => i.kind === "search_visibility")).toBe(true);
  });

  it("says nothing without that measured zero: figures, a drop to zero, no data, not set up, unusable credential or a failed read (AC-002)", () => {
    const none = (gsc: SearchConsoleSummary) => build([clean()], [], [], 0, gsc).items.some((i) => i.kind === "search_visibility");
    expect(none(gscOf(snapshot()))).toBe(false);
    expect(none(gscOf(snapshot({ totals: zero })))).toBe(false);
    expect(none(gscOf(null))).toBe(false);
    expect(none(gscOf(null, { state: "not_configured" }))).toBe(false);
    expect(none(gscOf(null, { state: "invalid", reason: "not_json" }))).toBe(false);
    expect(none(gscOf(snapshot({ status: "failed", totals: null, previousTotals: null, errorKind: "no_access" })))).toBe(false);
    // Without a summary at all (callers that do not read Search Console) nothing changes.
    expect(build([clean()], []).items.some((i) => i.kind === "search_visibility")).toBe(false);
  });

  it("keeps one per kind, at most three, highest priority first (AC-003)", () => {
    const findings = [
      finding({ severity: "critical", category: "metadata", ruleId: "title_missing" }),
      finding({ severity: "warning", category: "crawling", ruleId: "sitemap_missing" }),
    ];
    const a = audit({ at: daysAgo(1), facts: facts({ performance: perf(40) }) });
    const list = build([a], findings, [], 0, empty());
    expect(list.items.map((o) => o.kind)).toEqual(["metadata", "speed", "sitemap"]);
    const withRoom = build([clean()], [findings[1]!], [], 0, empty());
    expect(withRoom.items.map((o) => [o.kind, o.priority])).toEqual([
      ["sitemap", "medium"],
      ["search_visibility", "medium"],
    ]);
  });

  it("states no cause and exists in English (AC-004)", () => {
    const es = build([clean()], [], [], 0, empty()).items.find((i) => i.kind === "search_visibility")!;
    for (const text of [es.title, es.problem, es.why, es.action]) expect(text).not.toMatch(/porque|debido a|por culpa/i);
    const en = build([clean()], [], [], 0, gscOf(snapshot({ totals: zero, previousTotals: zero }), READY, "en"), "en").items.find((i) => i.kind === "search_visibility")!;
    expect(en.title).toBe("Check whether Google has your website in its index");
    expect(en.sourceLabel).toBe("Search Console");
    for (const text of [en.title, en.problem, en.why, en.action]) expect(text).not.toMatch(/because|due to/i);
  });
});

