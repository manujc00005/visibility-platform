import { describe, expect, it } from "vitest";
import { summarizeAi } from "@/modules/overview/ai";
import { buildOpportunities } from "@/modules/overview/opportunities";
import { summarizePerformance } from "@/modules/overview/performance";
import { summarizeSeo } from "@/modules/overview/seo";
import type { AuditInput, FindingLike } from "@/modules/overview/types";
import { audit, daysAgo, facts, finding, NOW, perf, run } from "./fixtures";

function build(audits: AuditInput[], findings: FindingLike[], runs: ReturnType<typeof run>[] = [], activePrompts = 0) {
  const latest = audits.find((a) => a.status === "completed");
  const byAudit = latest ? { [latest.id]: findings } : {};
  return buildOpportunities({
    findings,
    seo: summarizeSeo(audits, byAudit, NOW),
    performance: summarizePerformance(audits, findings, NOW),
    ai: summarizeAi(runs, activePrompts, NOW),
  });
}

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
