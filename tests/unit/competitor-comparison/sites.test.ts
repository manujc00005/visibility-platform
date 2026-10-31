import { describe, expect, it } from "vitest";
import { emptyFieldData, type FieldDataResult } from "@/modules/audits/crux";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import type { AuditFacts, Finding, PageResult } from "@/modules/audits/rules";
import { MAX_SITES, parseComparison, selectSites, toSiteResult, unprocessedSite, type AuthorityResult, type SiteResult, type SiteTarget } from "@/modules/competitor-comparison/sites";

const company = { name: "Olessium", domain: "olessium.com", hostname: "www.olessium.com" };
const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const competitor = (n: number, domain: string | null, day = n) => ({ id: uuid(n), name: `Rival ${n}`, domain, createdAt: new Date(Date.UTC(2026, 0, day)) });

describe("selectSites", () => {
  it("puts the company first and the competitors in stable order", () => {
    const { sites, eligible } = selectSites(company, [competitor(2, "dos.es", 5), competitor(1, "uno.es", 1)]);
    expect(sites.map((s) => [s.role, s.domain, s.hostname])).toEqual([
      ["company", "olessium.com", "www.olessium.com"],
      ["competitor", "uno.es", "uno.es"],
      ["competitor", "dos.es", "dos.es"],
    ]);
    expect(eligible).toBe(true);
  });

  it("measures each domain once, keeping the oldest competitor and breaking ties by id", () => {
    const { sites, withoutWebsite, duplicates } = selectSites(company, [competitor(3, "uno.es", 1), competitor(1, "uno.es", 1), competitor(2, "uno.es", 9), competitor(4, null), competitor(5, "olessium.com")]);
    expect(sites.map((s) => s.competitorId)).toEqual([null, uuid(1)]);
    expect(withoutWebsite.map((c) => c.id)).toEqual([uuid(4)]);
    expect(duplicates.map((c) => c.id).sort()).toEqual([uuid(2), uuid(3), uuid(5)]);
  });

  it("is not eligible when every competitor repeats the company or has no website", () => {
    const { sites, eligible } = selectSites(company, [competitor(1, "olessium.com"), competitor(2, "OLESSIUM.COM"), competitor(3, null)]);
    expect(sites).toHaveLength(1);
    expect(eligible).toBe(false);
  });

  it("never goes over six sites", () => {
    const many = Array.from({ length: 8 }, (_, i) => competitor(i + 1, `rival${i}.es`));
    expect(selectSites(company, many).sites).toHaveLength(MAX_SITES);
  });
});

const PRIVATE_TEXTS = ["Título secreto", "Descripción secreta", "https://rival.es/ruta-secreta", "mensaje secreto del fetcher", "comprobación secreta"];

const performance: PerformanceResult = {
  ...emptyResult("not_configured"),
  status: "ok",
  score: 41,
  metrics: { lcpMs: 2100, cls: 0.07, tbtMs: 310, fcpMs: 900, speedIndexMs: 1500 },
  lighthouseVersion: "12.1.0",
  categories: {
    seo: { score: 82, scored: 1, failingTotal: 1, failing: [{ id: "x", title: PRIVATE_TEXTS[4]!, score: 0 }] },
    accessibility: { score: 63, scored: 1, failingTotal: 0, failing: [] },
    "best-practices": { score: 94, scored: 1, failingTotal: 0, failing: [] },
  },
} as PerformanceResult;
const field: FieldDataResult = {
  ...emptyFieldData("no_data"),
  status: "ok",
  scope: "origin",
  key: PRIVATE_TEXTS[2]!,
  collectionPeriod: { firstDate: "2026-09-01", lastDate: "2026-09-28" },
  metrics: { lcpMs: 3100, inpMs: 240, cls: 0.12, fcpMs: 1200, ttfbMs: 500 },
};
const page = (overrides: Partial<PageResult> = {}): AuditFacts["page"] => ({
  kind: "fetched",
  result: { url: PRIVATE_TEXTS[2]!, status: 200, contentType: "text/html", xRobotsTag: null, redirects: [], facts: { title: PRIVATE_TEXTS[0], description: PRIVATE_TEXTS[1] } as never, ...overrides },
});
const facts = (over: Partial<AuditFacts> = {}): AuditFacts => ({ requestedUrl: PRIVATE_TEXTS[2]!, httpsFailure: null, page: page(), robots: null, sitemap: null, performance, fieldData: field, ...over });
const finding = (severity: Finding["severity"]): Finding => ({ ruleId: "r", severity, category: "metadata", title: PRIVATE_TEXTS[0]!, evidence: [PRIVATE_TEXTS[1]!], recommendation: "" });
const target: SiteTarget = { role: "competitor", competitorId: uuid(1), name: "Rival", domain: "rival.es", hostname: "rival.es" };
const authority: AuthorityResult = { status: "ok", requestedDomain: "rival.es", effectiveDomain: "rival.es", scope: "registered_domain", asOf: "2026-10-01", score: 3.2, rank: 900, referringDomains: 12 };
const own: SiteTarget = { role: "company", competitorId: null, name: "Olessium", domain: "olessium.com", hostname: "www.olessium.com" };
const ownAuthority: AuthorityResult = { ...authority, requestedDomain: "olessium.com", effectiveDomain: "olessium.com" };

describe("toSiteResult", () => {
  it("maps each field to its own name and unit", () => {
    const site = toSiteResult(target, facts(), [finding("critical"), finding("warning"), finding("warning"), finding("info")], authority);
    expect(site).toMatchObject({
      access: "analyzed",
      criticalCount: 1,
      warningCount: 2,
      lighthouse: {
        status: "ok",
        lighthouseVersion: "12.1.0",
        performance: { value: 41 },
        seo: { value: 82 },
        accessibility: { value: 63 },
        bestPractices: { value: 94 },
        lcpMs: { value: 2100 },
        cls: { value: 0.07 },
        tbtMs: { value: 310 },
      },
      field: { status: "ok", formFactor: "PHONE", scope: "origin", period: { firstDate: "2026-09-01", lastDate: "2026-09-28" }, lcpMs: { value: 3100 }, inpMs: { value: 240 }, cls: { value: 0.12 } },
    });
  });

  it("keeps nothing a website said or a fetcher message", () => {
    const failed = facts({ page: { kind: "failed", failure: { kind: "timeout", message: PRIVATE_TEXTS[3]!, url: PRIVATE_TEXTS[2]! } } });
    const stored = JSON.stringify([toSiteResult(target, facts(), [finding("critical")], authority), toSiteResult(target, failed, [finding("critical")], authority)]);
    for (const text of PRIVATE_TEXTS) expect(stored).not.toContain(text);
  });

  it("keeps real zeros and marks only what is missing", () => {
    const partial = {
      ...performance,
      score: 0,
      metrics: { lcpMs: null, cls: 0, tbtMs: 0, fcpMs: null, speedIndexMs: null },
      categories: { seo: { score: 0, scored: 1, failingTotal: 0, failing: [] } },
    } as PerformanceResult;
    const realUsers = { ...field, metrics: { lcpMs: 3100, inpMs: null, cls: 0, fcpMs: null, ttfbMs: null } };
    const site = toSiteResult(target, facts({ performance: partial, fieldData: realUsers }), [], authority);
    expect(site.lighthouse).toMatchObject({ performance: { status: "ok", value: 0 }, seo: { status: "ok", value: 0 }, accessibility: { status: "not_measured" }, lcpMs: { status: "not_measured" }, cls: { status: "ok", value: 0 } });
    expect(site.field).toMatchObject({ inpMs: { status: "not_measured" }, cls: { status: "ok", value: 0 } });
    expect(site).toMatchObject({ criticalCount: 0, warningCount: 0 });
    expect(parseComparison({ version: 1, sites: [toSiteResult(own, facts(), [], ownAuthority), site] })).not.toBeNull();
  });

  it.each<[string, AuditFacts["page"], SiteResult["access"], string | null]>([
    ["forbidden by robots.txt", { kind: "disallowed" }, "robots_disallowed", null],
    ["down", { kind: "failed", failure: { kind: "dns", message: "x", url: "x" } }, "unreachable", "dns"],
    ["answering an error", page({ status: 503 }), "http_error", null],
    ["not html", page({ facts: null }), "non_html", null],
  ])("gives no counts to a site %s", (_, state, access, cause) => {
    const site = toSiteResult(target, facts({ page: state, performance: emptyResult("skipped"), fieldData: emptyFieldData("skipped") }), [finding("critical")], authority);
    expect(site).toMatchObject({ access, cause, criticalCount: null, warningCount: null, lighthouse: { status: "skipped" }, field: { status: "skipped" } });
  });

  it("fails only the source whose figures break the contract", () => {
    const wrong = { ...performance, score: 140 } as PerformanceResult;
    const reversed = { ...field, collectionPeriod: { firstDate: "2026-09-28", lastDate: "2026-09-01" } };
    expect(toSiteResult(target, facts({ performance: wrong }), [], authority)).toMatchObject({ lighthouse: { status: "error" }, field: { status: "ok" }, access: "analyzed" });
    expect(toSiteResult(target, facts({ fieldData: reversed }), [], authority)).toMatchObject({ lighthouse: { status: "ok" }, field: { status: "error" } });
  });

  it("leaves a site that could not be processed in contract, keeping its authority", () => {
    const site = unprocessedSite(target, authority);
    expect(site).toMatchObject({ access: "processing_error", lighthouse: { status: "error" }, field: { status: "error" }, criticalCount: null, authority });
    expect(parseComparison({ version: 1, sites: [toSiteResult(own, facts(), [], ownAuthority), site] })).not.toBeNull();
  });

  it("does not take a source without its scope as real-user data", () => {
    expect(toSiteResult(target, facts({ fieldData: { ...field, scope: null } }), [], authority).field).toEqual({ status: "error" });
  });
});

describe("parseComparison", () => {
  const valid = () => ({ version: 1 as const, sites: [toSiteResult(own, facts(), [], ownAuthority), toSiteResult(target, facts(), [], authority)] });
  const edit = (change: (site: Record<string, unknown>) => void, index = 1) => {
    const data = structuredClone(valid()) as unknown as { sites: Record<string, unknown>[] };
    change(data.sites[index]!);
    return data;
  };

  it("accepts a valid comparison and a single site", () => {
    expect(parseComparison(valid())).not.toBeNull();
    expect(parseComparison({ version: 1, sites: valid().sites.slice(0, 1) })).not.toBeNull();
  });

  it.each<[string, unknown]>([
    ["an unknown version", { ...valid(), version: 2 }],
    ["an extra root field", { ...valid(), extra: 1 }],
    ["no sites", { version: 1, sites: [] }],
    ["a competitor first", { version: 1, sites: [...valid().sites].reverse() }],
    ["two companies", { version: 1, sites: [valid().sites[0], { ...valid().sites[0], domain: "otra.es" }] }],
    ["a repeated domain", { version: 1, sites: [valid().sites[0], { ...valid().sites[1], domain: "olessium.com", hostname: "olessium.com" }] }],
    ["a repeated competitor", { version: 1, sites: [valid().sites[0], valid().sites[1], { ...valid().sites[1], domain: "dos.es", hostname: "dos.es" }] }],
    ["seven sites", { version: 1, sites: [valid().sites[0], ...Array.from({ length: 6 }, (_, i) => ({ ...valid().sites[1], competitorId: uuid(i + 1), domain: `r${i}.es`, hostname: `r${i}.es` }))] }],
    ["an extra site field", edit((s) => (s.title = "x"))],
    ["an unknown access", edit((s) => (s.access = "other"))],
    ["counts without analysis", edit((s) => (s.access = "http_error"))],
    ["analysis without counts", edit((s) => (s.criticalCount = null))],
    ["an unreachable site without cause", edit((s) => { s.access = "unreachable"; s.criticalCount = null; s.warningCount = null; })],
    ["a negative count", edit((s) => (s.criticalCount = -1))],
    ["a company with a competitor id", edit((s) => (s.competitorId = uuid(1)), 0)],
    ["a competitor without id", edit((s) => (s.competitorId = null))],
    ["a competitor hostname other than its domain", edit((s) => (s.hostname = "www.rival.es"))],
    ["an empty name", edit((s) => (s.name = ""))],
    ["a name over 120", edit((s) => (s.name = "x".repeat(121)))],
    ["an unknown lighthouse state", edit((s) => (s.lighthouse = { status: "other" }))],
    ["an unknown real-user state", edit((s) => (s.field = { status: "other" }))],
    ["an unknown authority state", edit((s) => (s.authority = { status: "other", requestedDomain: "rival.es" }))],
    ["a score over 100", edit((s) => ((s.lighthouse as { seo: unknown }).seo = { status: "ok", value: 101 }))],
    ["a measured metric without value", edit((s) => ((s.lighthouse as { cls: unknown }).cls = { status: "ok" }))],
    ["figures on an absent source", edit((s) => (s.lighthouse = { status: "skipped", performance: { status: "ok", value: 1 } }))],
    ["an impossible period", edit((s) => ((s.field as { period: unknown }).period = { firstDate: "2026-02-30", lastDate: "2026-03-01" }))],
    ["a reversed period", edit((s) => ((s.field as { period: unknown }).period = { firstDate: "2026-03-02", lastDate: "2026-03-01" }))],
    ["a url kept with real-user data", edit((s) => ((s.field as { key?: unknown }).key = "https://rival.es/"))],
    ["authority over 10", edit((s) => ((s.authority as { score: number }).score = 11))],
    ["a zero rank", edit((s) => ((s.authority as { rank: number }).rank = 0))],
    ["figures on a domain not found", edit((s) => (s.authority = { status: "not_found", requestedDomain: "rival.es", effectiveDomain: "rival.es", scope: "registered_domain", asOf: "2026-10-01", score: 1 }))],
    ["an invented effective domain on an error", edit((s) => (s.authority = { status: "error", requestedDomain: "rival.es", effectiveDomain: "rival.es" }))],
    ["null", null],
  ])("rejects %s", (_, raw) => expect(parseComparison(raw)).toBeNull());

  it("accepts authority zero, no rank and no referring domains", () => {
    const data = edit((s) => (s.authority = { ...authority, score: 0, rank: null, referringDomains: null }));
    expect(parseComparison(data)).not.toBeNull();
    const zero = edit((s) => (s.authority = { ...authority, referringDomains: 0 }));
    expect(parseComparison(zero)).not.toBeNull();
  });

  it("accepts real-user data without a period", () => {
    expect(parseComparison(edit((s) => ((s.field as { period: unknown }).period = null)))).not.toBeNull();
  });
});
