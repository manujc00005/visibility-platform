import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompetitorComparisonState } from "@/app/workspaces/[id]/seo/actions";
import { ComparisonSection } from "@/components/competitor-comparison/comparison-section";
import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/i18n/locale";
import type { AuthorityResult, FieldResult, LighthouseResult, SiteResult } from "@/modules/competitor-comparison/sites";
import type { ComparisonRow, ComparisonSummary } from "@/modules/competitor-comparison/summary";
import { displayDay } from "@/modules/search-console/summary";

const noop = async (state: CompetitorComparisonState) => state;
const ok = (value: number) => ({ status: "ok" as const, value });
const none = { status: "not_measured" as const };

const lighthouse: LighthouseResult = { status: "ok", lighthouseVersion: "12", performance: ok(41), seo: ok(82), accessibility: ok(63), bestPractices: ok(94), lcpMs: ok(2100), cls: ok(0.07), tbtMs: ok(300) };
const field: FieldResult = { status: "ok", formFactor: "PHONE", scope: "origin", period: { firstDate: "2026-09-01", lastDate: "2026-09-28" }, lcpMs: ok(3100), inpMs: ok(240), cls: ok(0.12) };
const authority: AuthorityResult = { status: "ok", requestedDomain: "rival.es", effectiveDomain: "rival.es", scope: "registered_domain", asOf: "2026-10-01", score: 3.25, rank: 1200, referringDomains: 88 };
const site = (over: Partial<SiteResult> = {}): SiteResult => ({
  role: "competitor",
  competitorId: "00000000-0000-4000-8000-000000000001",
  name: "Rival",
  domain: "rival.es",
  hostname: "rival.es",
  access: "analyzed",
  cause: null,
  lighthouse,
  field,
  criticalCount: 2,
  warningCount: 5,
  authority,
  ...over,
});
const measured = (s: SiteResult, over: Partial<ComparisonRow> = {}): ComparisonRow => ({ key: s.domain, role: s.role, name: s.name, domain: s.domain, state: "measured", site: s, measuredAs: null, ...over }) as ComparisonRow;
const summary = (rows: ComparisonRow[], over: Partial<ComparisonSummary> = {}): ComparisonSummary => ({
  blocker: null,
  running: false,
  failure: null,
  unreadable: false,
  capture: { startedAt: new Date("2026-10-31T10:00:00Z"), finishedAt: new Date("2026-10-31T10:03:00Z") },
  rows,
  mixedFieldScope: false,
  withoutWebsite: [],
  ...over,
});
const render = (s: ComparisonSummary, locale: Locale = "es") => renderToStaticMarkup(createElement(ComparisonSection, { s, action: noop, manageHref: "/workspaces/x/geo/setup", locale }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const locales = ["es", "en"] as const;

describe("comparison section", () => {
  it.each(locales)("shows the figures, the capture and the sources in %s", (locale) => {
    const t = getMessages(locale).competitorComparison;
    const html = render(summary([measured(site({ role: "company", competitorId: null, name: "Olessium", domain: "olessium.com" })), measured(site())]), locale);
    for (const label of Object.values(t.columns)) expect(html).toContain(label);
    expect(html).toContain(t.you);
    expect(text(html)).toContain(t.context);
    expect(html).toContain(t.source);
    expect(html).toContain(locale === "es" ? "3,25" : "3.25");
    expect(html).toContain(displayDay("2026-09-01", locale));
    expect(html).toContain(displayDay("2026-10-01", locale));
    expect(text(html)).toContain(t.scope.origin);
    expect(html).toContain('role="table"');
    expect(html).toContain('role="rowheader"');
  });

  it("names no winner and adds no combined score", () => {
    const html = render(summary([measured(site({ role: "company", competitorId: null })), measured(site({ domain: "otro.es", hostname: "otro.es" }))]));
    expect(html).not.toMatch(/ganador|mejor|peor|winner|best site|total/i);
  });

  it("keeps real zeros", () => {
    const zero = site({
      lighthouse: { ...lighthouse, performance: ok(0) } as LighthouseResult,
      field: { ...field, cls: ok(0) } as FieldResult,
      criticalCount: 0,
      warningCount: 0,
      authority: { ...authority, score: 0, referringDomains: 0 } as AuthorityResult,
    });
    const page = text(render(summary([measured(zero)])));
    expect(page).toContain("0,00");
    expect(page.match(/(^| )0( |$)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it.each(locales)("explains a metric not measured without losing the others (%s)", (locale) => {
    const t = getMessages(locale).competitorComparison;
    const html = render(summary([measured(site({ lighthouse: { ...lighthouse, seo: none } as LighthouseResult, field: { ...field, inpMs: none } as FieldResult }))]), locale);
    expect(html.match(new RegExp(t.notMeasured, "g"))).toHaveLength(2);
    expect(html).not.toContain("colSpan");
    expect(html).toContain(">41<");
  });

  it.each(locales)("gives a whole missing source one reason across its columns (%s)", (locale) => {
    const t = getMessages(locale).competitorComparison;
    const html = render(summary([measured(site({ lighthouse: { status: "quota_exceeded" }, field: { status: "no_data" } }))]), locale);
    expect(html).toContain('colSpan="4"');
    expect(html).toContain('colSpan="3"');
    expect(html).toContain(t.lighthouseStatus.quota_exceeded);
    expect(html).toContain(t.fieldStatus.no_data);
  });

  it.each(locales)("explains every state of a source (%s)", (locale) => {
    const t = getMessages(locale).competitorComparison;
    for (const status of ["not_configured", "quota_exceeded", "error"] as const) expect(render(summary([measured(site({ lighthouse: { status } }))]), locale)).toContain(t.lighthouseStatus[status]);
    for (const status of ["no_data", "not_configured", "quota_exceeded", "error"] as const) expect(render(summary([measured(site({ field: { status } }))]), locale)).toContain(t.fieldStatus[status]);
    for (const status of ["not_configured", "invalid_key", "ip_not_allowed", "quota_exceeded", "error"] as const) {
      expect(render(summary([measured(site({ authority: { status, requestedDomain: "rival.es" } }))]), locale)).toContain(t.authorityStatus[status]);
    }
    const notFound: AuthorityResult = { status: "not_found", requestedDomain: "rival.es", effectiveDomain: "rival.es", scope: "registered_domain", asOf: "2026-10-01" };
    expect(render(summary([measured(site({ authority: notFound }))]), locale)).toContain(t.authorityStatus.not_found);
  });

  it.each(locales)("says why a site was not analysed (%s)", (locale) => {
    const t = getMessages(locale).competitorComparison;
    for (const access of ["robots_disallowed", "http_error", "non_html"] as const) {
      const html = render(summary([measured(site({ access, criticalCount: null, warningCount: null, lighthouse: { status: "skipped" }, field: { status: "skipped" } }))]), locale);
      expect(html.match(new RegExp(t.access[access].replace(".", "\\."), "g"))!.length).toBe(3);
    }
    const down = site({ access: "unreachable", cause: "dns", criticalCount: null, warningCount: null, lighthouse: { status: "skipped" }, field: { status: "skipped" } });
    expect(render(summary([measured(down)]), locale)).toContain(t.access.unreachable);
  });

  it("marks a host whose authority is that of its registered domain", () => {
    const t = getMessages("es").competitorComparison;
    const html = render(summary([measured(site({ domain: "blog.rival.es", hostname: "blog.rival.es", authority: { ...authority, requestedDomain: "blog.rival.es" } as AuthorityResult }))]));
    expect(html).toContain(t.authorityDetail("rival.es", displayDay("2026-10-01")));
    expect(html).toContain(t.subdomainNote);
    expect(render(summary([measured(site())]))).not.toContain(t.subdomainNote);
  });

  it("explains rank and linking domains missing, without a zero", () => {
    const t = getMessages("es").competitorComparison;
    const html = render(summary([measured(site({ authority: { ...authority, rank: null, referringDomains: null } as AuthorityResult }))]));
    expect(html).toContain(t.noRank);
    expect(html).toContain(t.unavailable);
  });

  it("warns when real-user scopes differ", () => {
    const t = getMessages("es").competitorComparison;
    expect(render(summary([measured(site())], { mixedFieldScope: true }))).toContain(t.mixedScope);
    expect(render(summary([measured(site())]))).not.toContain(t.mixedScope);
  });

  it("shows a name as plain text", () => {
    const html = render(summary([measured(site({ name: "<script>alert(1)</script>" }))]));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("keeps the measured name when it changed", () => {
    const t = getMessages("es").competitorComparison;
    expect(render(summary([measured(site(), { name: "Nuevo", measuredAs: "Rival" } as Partial<ComparisonRow>)]))).toContain(t.measuredAs("Rival"));
  });

  it("marks a pending row across all the columns", () => {
    const t = getMessages("es").competitorComparison;
    const html = render(summary([{ key: "x", role: "competitor", name: "Nuevo", domain: "nuevo.es", state: "pending" }]));
    expect(html).toContain(t.pending);
    expect(html).toContain('colSpan="11"');
  });

  it.each(locales)("says what is missing and offers no button (%s)", (locale) => {
    const t = getMessages(locale).competitorComparison;
    const blocked = (blocker: "not_configured" | "no_competitors") => render(summary([], { blocker, capture: null }), locale);
    expect(blocked("not_configured")).toContain(t.needs.not_configured);
    expect(blocked("not_configured")).not.toContain("<button");
    expect(blocked("no_competitors")).toContain(t.needs.no_competitors);
    expect(blocked("no_competitors")).toContain('href="/workspaces/x/geo/setup"');
    expect(blocked("no_competitors")).not.toContain("<button");
  });

  it("offers the button with what the operator can do next", () => {
    const t = getMessages("es").competitorComparison;
    expect(render(summary([], { capture: null }))).toContain(t.button.run);
    expect(render(summary([], { capture: null }))).toContain(t.empty);
    expect(render(summary([measured(site())]))).toContain(t.button.rerun);
  });

  it.each(locales)("tells a running comparison, a failure and an unreadable one (%s)", (locale) => {
    const t = getMessages(locale).competitorComparison;
    expect(render(summary([measured(site())], { running: true }), locale)).toContain(t.running);
    const failure = { error: "interrupted", at: new Date("2026-10-31T11:00:00Z") } as const;
    const failed = render(summary([measured(site())], { failure }), locale);
    expect(text(failed)).toContain(t.failure.interrupted);
    expect(failed).toContain(">41<");
    expect(render(summary([measured(site())], { unreadable: true }), locale)).toContain(t.unreadable);
  });

  it("lists competitors without a website", () => {
    const t = getMessages("es").competitorComparison;
    expect(render(summary([], { withoutWebsite: ["Uno", "Dos"], capture: null }))).toContain(t.withoutWebsite("Uno, Dos"));
  });
});
