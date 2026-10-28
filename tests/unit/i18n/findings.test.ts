import { describe, expect, it } from "vitest";
import { findingText, SUPPORTED_RULES_VERSIONS, type FindingCatalog, type FindingContext } from "@/i18n/findings";
import { getFindingCatalog } from "@/i18n/messages/findings";
import type { AuditFacts } from "@/modules/audits/rules";

const stored = { ruleId: "page_http_error", title: "La portada responde 503", recommendation: "Revisa el servidor." };

// Only the fields the stub adapter reads; the real adapters arrive in T005.
const facts = { page: { result: { status: 503 } } } as unknown as AuditFacts;
const context: FindingContext = { facts, rulesVersion: SUPPORTED_RULES_VERSIONS[0] };

const catalog: FindingCatalog = {
  robots_missing: { title: "No robots.txt", recommendation: "Publish a robots.txt file." },
  page_http_error: {
    params: (f) => {
      const status = (f as unknown as { page?: { result?: { status?: unknown } } }).page?.result?.status;
      return typeof status === "number" ? { status } : null;
    },
    title: (p) => `The home page answers ${p.status}`,
    recommendation: "Check the server.",
  },
};

describe("findingText", () => {
  it("returns the stored Spanish texts untouched in es, whatever the catalog holds", () => {
    expect(findingText(stored, "es", context, catalog)).toEqual({ title: stored.title, recommendation: stored.recommendation, fallback: false });
    expect(findingText({ ...stored, ruleId: "unknown_rule" }, "es")).toEqual({
      title: stored.title,
      recommendation: stored.recommendation,
      fallback: false,
    });
  });

  it("translates static rules without context", () => {
    expect(findingText({ ruleId: "robots_missing", title: "Sin robots.txt", recommendation: "Publica robots.txt." }, "en", undefined, catalog)).toEqual({
      title: "No robots.txt",
      recommendation: "Publish a robots.txt file.",
      fallback: false,
    });
  });

  it("translates dynamic rules from the stored facts of the same audit", () => {
    expect(findingText(stored, "en", context, catalog)).toEqual({
      title: "The home page answers 503",
      recommendation: "Check the server.",
      fallback: false,
    });
  });

  it("falls back to the stored texts for an unknown rule", () => {
    expect(findingText({ ...stored, ruleId: "retired_rule" }, "en", context, catalog)).toEqual({
      title: stored.title,
      recommendation: stored.recommendation,
      fallback: true,
    });
  });

  it("falls back when a dynamic rule lacks context, version or the value itself", () => {
    const expected = { title: stored.title, recommendation: stored.recommendation, fallback: true };
    expect(findingText(stored, "en", undefined, catalog)).toEqual(expected);
    expect(findingText(stored, "en", { facts: null, rulesVersion: "2026-10-26.1" }, catalog)).toEqual(expected);
    expect(findingText(stored, "en", { facts, rulesVersion: null }, catalog)).toEqual(expected);
    expect(findingText(stored, "en", { facts, rulesVersion: "2099-01-01.1" }, catalog)).toEqual(expected);
    const noStatus = { page: { result: {} } } as unknown as AuditFacts;
    expect(findingText(stored, "en", { facts: noStatus, rulesVersion: "2026-10-26.1" }, catalog)).toEqual(expected);
  });

  it("uses the English catalog by default, filled for every rule in T005", () => {
    expect(Object.keys(getFindingCatalog("en"))).toHaveLength(43);
    // The stub facts lack `page.kind`, so the real adapter cannot read the status: stored text, flagged.
    expect(findingText(stored, "en", context)).toEqual({ title: stored.title, recommendation: stored.recommendation, fallback: true });
  });
});
