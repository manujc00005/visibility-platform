import { describe, expect, it } from "vitest";
import { findingText } from "@/i18n/findings";
import { getFindingCatalog } from "@/i18n/messages/findings";
import { evaluateAudit, RULES_VERSION, type AuditFacts, type Finding } from "@/modules/audits/rules";
import corpus from "./fixtures/findings-corpus.json";
import { buildCorpusInputs } from "./fixtures/findings-corpus.scenarios";

/**
 * Regression corpus captured from the implementation that preceded the findings catalog
 * (2026-10-27): every emittable rule id, the ten dynamic titles and both `not_https` variants.
 * The frozen outputs are compared field by field, in order (SPEC «Contrato de hallazgos»).
 */

interface Scenario {
  name: string;
  facts: AuditFacts;
  findings: Finding[];
}

const scenarios = corpus.scenarios as unknown as Scenario[];
const allFindings = scenarios.flatMap((s) => s.findings.map((finding) => ({ scenario: s, finding })));
const context = (s: Scenario) => ({ facts: s.facts, rulesVersion: corpus.rulesVersion });

const DYNAMIC_IDS = [
  "page_http_error",
  "redirect_chain",
  "canonical_multiple",
  "title_too_long",
  "title_too_short",
  "title_multiple",
  "description_length",
  "description_multiple",
  "h1_multiple",
  "lcp_slow",
];

function one(scenario: string, ruleId: string): Finding {
  const found = scenarios.find((s) => s.name === scenario)?.findings.find((f) => f.ruleId === ruleId);
  if (!found) throw new Error(`${scenario}/${ruleId} missing from the corpus`);
  return found;
}

describe("findings regression corpus", () => {
  it("keeps the rules version the corpus was captured with", () => {
    expect(RULES_VERSION).toBe("2026-10-26.1");
    expect(corpus.rulesVersion).toBe(RULES_VERSION);
  });

  it("still builds the frozen inputs from the scenario builder", () => {
    expect(buildCorpusInputs()).toEqual(Object.fromEntries(scenarios.map((s) => [s.name, s.facts])));
  });

  it.each(scenarios.map((s) => [s.name, s] as const))("%s: evaluateAudit reproduces every field, in order", (_, s) => {
    expect(evaluateAudit(s.facts)).toEqual(s.findings);
  });

  it("covers every rule of both catalogs, the ten dynamic titles and both not_https variants", () => {
    const ids = [...new Set(allFindings.map((x) => x.finding.ruleId))].sort();
    expect(ids).toHaveLength(43);
    expect(ids).toEqual(Object.keys(getFindingCatalog("es")).sort());
    expect(ids).toEqual(Object.keys(getFindingCatalog("en")).sort());
    for (const id of DYNAMIC_IDS) expect(ids).toContain(id);
    const https = allFindings.filter((x) => x.finding.ruleId === "not_https").map((x) => x.finding.title);
    expect(new Set(https)).toEqual(new Set(["La web no usa HTTPS", "La conexión segura (HTTPS) no funciona"]));
  });
});

describe("findingText over the corpus", () => {
  it("returns the stored Spanish texts untouched in es", () => {
    for (const { scenario, finding } of allFindings) {
      expect(findingText(finding, "es", context(scenario))).toEqual({ title: finding.title, recommendation: finding.recommendation, fallback: false });
    }
  });

  it("translates every finding to English from the facts of its own audit, never falling back", () => {
    for (const { scenario, finding } of allFindings) {
      const text = findingText(finding, "en", context(scenario));
      expect(text.fallback, `${scenario.name}/${finding.ruleId}`).toBe(false);
      expect(text.title, `${scenario.name}/${finding.ruleId}`).not.toBe(finding.title);
      expect(text.recommendation, `${scenario.name}/${finding.ruleId}`).not.toBe(finding.recommendation);
      expect(text.title).not.toMatch(/[áéíóúñ¿¡«»]/);
      // Recommendations may quote a Spanish brand as an example («García»); no Spanish punctuation, though.
      expect(text.recommendation).not.toMatch(/[¿¡«»]/);
    }
  });

  it("fills the English dynamic titles with the historical values", () => {
    const en = (scenario: string, ruleId: string) => findingText(one(scenario, ruleId), "en", context(scenarios.find((s) => s.name === scenario)!)).title;
    expect(en("page_http_error", "page_http_error")).toBe("The home page answers with error 503");
    expect(en("redirects_cross_host", "redirect_chain")).toBe("The home page goes through 2 redirects");
    expect(en("canonicals", "canonical_multiple")).toBe("There are 2 canonical tags");
    expect(en("metadata_long", "title_too_long")).toBe("The title is long (86 characters)");
    expect(en("metadata_short_multiple", "title_too_short")).toBe("The title is very short (6 characters)");
    expect(en("metadata_short_multiple", "title_multiple")).toBe("There are 2 <title> tags");
    expect(en("metadata_long", "description_length")).toBe("The meta description is 196 characters long");
    expect(en("metadata_short_multiple", "description_multiple")).toBe("There are 2 meta descriptions");
    expect(en("metadata_short_multiple", "h1_multiple")).toBe("There are 2 H1 headings");
    expect(en("performance_slow_warning", "lcp_slow")).toBe("The main content takes 5 s to appear on mobile");
    expect(en("performance_slow_info", "lcp_slow")).toBe("The main content takes 3 s to appear on mobile");
    expect(en("not_https_plain", "not_https")).toBe("The website does not use HTTPS");
    expect(en("not_https_failed", "not_https")).toBe("The secure connection (HTTPS) does not work");
  });

  it("formats LCP with the decimal separator of each language", () => {
    const base = scenarios.find((s) => s.name === "performance_slow_warning")!;
    const facts: AuditFacts = { ...base.facts, performance: { ...base.facts.performance, metrics: { ...base.facts.performance.metrics!, lcpMs: 4500 } } };
    const stored = evaluateAudit(facts).find((f) => f.ruleId === "lcp_slow")!;
    expect(stored.title).toBe("El contenido principal tarda 4,5 s en aparecer en móvil");
    expect(findingText(stored, "en", { facts, rulesVersion: RULES_VERSION }).title).toBe("The main content takes 4.5 s to appear on mobile");
  });

  it("keeps the stored texts, flagged, when a dynamic rule lacks context, version or value", () => {
    const scenario = scenarios.find((s) => s.name === "page_http_error")!;
    const finding = one("page_http_error", "page_http_error");
    const fallback = { title: finding.title, recommendation: finding.recommendation, fallback: true };
    expect(findingText(finding, "en")).toEqual(fallback);
    expect(findingText(finding, "en", { facts: scenario.facts, rulesVersion: "2099-01-01.1" })).toEqual(fallback);
    expect(findingText(finding, "en", { facts: null, rulesVersion: RULES_VERSION })).toEqual(fallback);
    const unreachable = scenarios.find((s) => s.name === "page_unreachable")!;
    expect(findingText(finding, "en", context(unreachable))).toEqual(fallback);
    // The HTTPS variant needs the stored `httpsFailure`; audits without that field keep their text.
    const noHttpsField = { ...scenario.facts } as Partial<AuditFacts>;
    delete noHttpsField.httpsFailure;
    const https = one("not_https_failed", "not_https");
    expect(findingText(https, "en", { facts: noHttpsField as AuditFacts, rulesVersion: RULES_VERSION }).fallback).toBe(true);
    // Static rules translate without any context.
    expect(findingText(one("robots_missing", "robots_missing"), "en").fallback).toBe(false);
    // Unknown rules keep their text.
    expect(findingText({ ...finding, ruleId: "retired_rule" }, "en", context(scenario))).toEqual(fallback);
  });
});
