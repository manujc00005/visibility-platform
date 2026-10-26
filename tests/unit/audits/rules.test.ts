import { describe, expect, it } from "vitest";
import { extractPage } from "@/modules/audits/html";
import type { FieldDataResult } from "@/modules/audits/crux";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import { evaluateAudit, type AuditFacts } from "@/modules/audits/rules";

const URL_ = "https://www.clinicagarcia.es/";

const CLEAN_HTML = `<!doctype html><html lang="es"><head>
<title>Clínica Dental García | Implantes en Valladolid</title>
<meta name="description" content="Clínica dental en Valladolid con implantes, ortodoncia invisible y odontología general. Pide tu primera cita sin coste.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://www.clinicagarcia.es/">
<meta property="og:title" content="Clínica Dental García"><meta property="og:description" content="Implantes en Valladolid"><meta property="og:image" content="https://www.clinicagarcia.es/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Clínica Dental García"}</script>
</head><body><h1>Clínica dental en Valladolid</h1><h2>Servicios</h2><a href="/servicios">Servicios</a><a href="/contacto">Contacto</a></body></html>`;

const GOOD_PERF: PerformanceResult = {
  status: "ok",
  strategy: "mobile",
  score: 95,
  metrics: { lcpMs: 1800, cls: 0.02, tbtMs: 90, fcpMs: 1000, speedIndexMs: 1500 },
  lighthouseVersion: "12.8.2",
  error: null,
};

function facts(overrides: Partial<AuditFacts> = {}, html = CLEAN_HTML, pageOverrides: Record<string, unknown> = {}): AuditFacts {
  return {
    requestedUrl: URL_,
    httpsFailure: null,
    page: {
      kind: "fetched",
      result: {
        url: URL_,
        status: 200,
        contentType: "text/html; charset=utf-8",
        xRobotsTag: null,
        redirects: [],
        facts: extractPage(html, URL_),
        ...pageOverrides,
      },
    },
    robots: {
      url: "https://www.clinicagarcia.es/robots.txt",
      status: "ok",
      httpStatus: 200,
      error: null,
      sitemaps: ["https://www.clinicagarcia.es/sitemap.xml"],
      homepageAllowedForGoogle: true,
      homepageAllowedForUs: true,
    },
    sitemap: {
      url: "https://www.clinicagarcia.es/sitemap.xml",
      source: "robots",
      status: "ok",
      httpStatus: 200,
      error: null,
      sitemap: { kind: "urlset", locCount: 12, sample: [URL_], invalidLocCount: 0 },
      homepageListed: true,
    },
    performance: GOOD_PERF,
    ...overrides,
  };
}

const ids = (input: AuditFacts) => evaluateAudit(input).map((f) => f.ruleId);
const find = (input: AuditFacts, ruleId: string) => evaluateAudit(input).find((f) => f.ruleId === ruleId);

const FIELD: FieldDataResult = {
  status: "ok",
  formFactor: "PHONE",
  scope: "origin",
  key: "https://www.clinicagarcia.es",
  collectionPeriod: { firstDate: "2026-09-27", lastDate: "2026-10-24" },
  metrics: { lcpMs: 2100, inpMs: 150, cls: 0.05, fcpMs: 1500, ttfbMs: 600 },
  error: null,
};
const field = (metrics: Partial<NonNullable<FieldDataResult["metrics"]>>) => ({ fieldData: { ...FIELD, metrics: { ...FIELD.metrics!, ...metrics } } });

describe("real-user (CrUX) findings", () => {
  it("adds nothing when every Core Web Vital is good, when there is no data, or for old audits", () => {
    expect(ids(facts({ fieldData: FIELD }))).toEqual([]);
    expect(ids(facts({ fieldData: { ...FIELD, status: "no_data", metrics: null } }))).toEqual([]);
    expect(ids(facts())).toEqual([]);
  });

  it("is info when a metric needs improvement and warning when one is poor", () => {
    expect(find(facts(field({ inpMs: 300 })), "field_cwv_failed")).toMatchObject({ severity: "info", category: "performance" });
    const poor = find(facts(field({ lcpMs: 4500, cls: 0.12 })), "field_cwv_failed")!;
    expect(poor.severity).toBe("warning");
    expect(poor.evidence).toEqual([
      "Carga del contenido principal (LCP): 4,5 s, mala (bueno: ≤ 2,5 s)",
      "Estabilidad visual (CLS): 0,12, mejorable (bueno: ≤ 0,1)",
      "Datos de usuarios de Chrome en móvil, percentil 75, últimos 28 días (2026-09-27 a 2026-10-24), de toda la web",
    ]);
  });

  it("ignores metrics that CrUX did not report", () => {
    expect(ids(facts(field({ lcpMs: null, inpMs: null, cls: null })))).toEqual([]);
  });
});

describe("evaluateAudit", () => {
  it("produces no findings for a clean, well-configured page", () => {
    expect(evaluateAudit(facts())).toEqual([]);
  });

  it("treats a missing PageSpeed configuration as no finding (shown as a section status instead)", () => {
    expect(ids(facts({ performance: { ...GOOD_PERF, status: "not_configured", metrics: null, score: null } }))).toEqual([]);
  });

  it("flags noindex from X-Robots-Tag as critical", () => {
    const finding = find(facts({}, CLEAN_HTML, { xRobotsTag: "noindex, nofollow" }), "noindex");
    expect(finding).toMatchObject({ severity: "critical", category: "indexability" });
    expect(finding!.evidence).toContain("X-Robots-Tag: noindex, nofollow");
  });

  it("flags robots.txt blocking Google from the home page as critical", () => {
    const input = facts();
    input.robots!.homepageAllowedForGoogle = false;
    expect(find(input, "robots_blocks_homepage")?.severity).toBe("critical");
  });

  it("reports only access problems when the page cannot be fetched", () => {
    const input = facts({
      page: { kind: "failed", failure: { kind: "dns", message: "Could not resolve x (ENOTFOUND)", url: URL_ } },
      robots: null,
      sitemap: null,
    });
    const findings = evaluateAudit(input);
    expect(findings.map((f) => f.ruleId)).toEqual(["page_unreachable"]);
    expect(findings[0]!.evidence[0]).toContain("no se pudo resolver");
  });

  it("explains when robots.txt forbids our own crawler", () => {
    expect(ids(facts({ page: { kind: "disallowed" } }))).toContain("page_disallowed_for_audit");
  });

  it("flags http final URLs, error statuses and non-HTML responses", () => {
    expect(ids(facts({}, CLEAN_HTML, { url: "http://www.clinicagarcia.es/" }))).toContain("not_https");
    expect(find(facts({}, CLEAN_HTML, { status: 503 }), "page_http_error")?.title).toContain("503");
    expect(ids(facts({}, CLEAN_HTML, { contentType: "application/json" }))).toContain("page_not_html");
  });

  it("flags a canonical pointing elsewhere but accepts a trailing-slash variant of itself", () => {
    const other = CLEAN_HTML.replace('href="https://www.clinicagarcia.es/"', 'href="https://clinicagarcia.es/inicio"');
    expect(find(facts({}, other), "canonical_other_url")?.evidence).toEqual([`Página: ${URL_}`, "Canonical: https://clinicagarcia.es/inicio"]);
    const noSlash = CLEAN_HTML.replace('href="https://www.clinicagarcia.es/"', 'href="https://www.clinicagarcia.es"');
    expect(ids(facts({}, noSlash))).not.toContain("canonical_other_url");
  });

  it("orders findings critical first and includes the observed values as evidence", () => {
    const bad = `<html><head><title>x</title><title>y</title></head><body><h2>A</h2><h4>B</h4></body></html>`;
    const findings = evaluateAudit(facts({}, bad));
    const severities = findings.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ["critical", "warning", "info"].indexOf(a) - ["critical", "warning", "info"].indexOf(b)));
    expect(find(facts({}, bad), "title_too_short")?.evidence).toEqual(["x"]);
    expect(find(facts({}, bad), "heading_level_skip")?.evidence).toEqual(["H2 «A» → H4 «B»"]);
    expect(ids(facts({}, bad))).toEqual(
      expect.arrayContaining(["title_multiple", "description_missing", "canonical_missing", "h1_missing", "viewport_missing", "lang_missing", "internal_links_none", "structured_data_missing", "open_graph_incomplete"]),
    );
  });

  it("scales performance severity with the measured values", () => {
    const withLcp = (lcpMs: number) => facts({ performance: { ...GOOD_PERF, metrics: { ...GOOD_PERF.metrics!, lcpMs } } });
    expect(find(withLcp(2400), "lcp_slow")).toBeUndefined();
    expect(find(withLcp(3000), "lcp_slow")?.severity).toBe("info");
    expect(find(withLcp(5000), "lcp_slow")?.severity).toBe("warning");
    expect(find(withLcp(5000), "lcp_slow")?.title).toContain("5 s");
    expect(ids(facts({ performance: { ...GOOD_PERF, status: "error", metrics: null, error: "x" } }))).toEqual(["performance_unavailable"]);
  });

  it("handles sitemap and robots.txt problems", () => {
    const soft404 = facts();
    soft404.sitemap = { ...soft404.sitemap!, status: "invalid", error: "not_a_sitemap", sitemap: null };
    expect(find(soft404, "sitemap_invalid")?.evidence[0]).toContain("parece una página web");

    const undeclared = facts();
    undeclared.sitemap!.source = "default";
    expect(ids(undeclared)).toEqual(["sitemap_not_declared"]);

    const robots503 = facts();
    robots503.robots = { ...robots503.robots!, status: "http_error", httpStatus: 503 };
    expect(find(robots503, "robots_error")?.severity).toBe("warning");

    const missing = facts();
    missing.sitemap = { ...missing.sitemap!, status: "not_found", httpStatus: 404, sitemap: null };
    expect(find(missing, "sitemap_missing")?.severity).toBe("warning");
  });

  it("recognises non-business structured data", () => {
    const article = CLEAN_HTML.replace('"@type":"Dentist"', '"@type":"WebPage"');
    expect(find(facts({}, article), "structured_data_no_business")?.evidence[0]).toContain("WebPage");
  });

  it("does not evaluate the content of an error page", () => {
    const parked = `<!doctype html><html><head><style>x</style></head><body><iframe src="/parking"></iframe></body></html>`;
    expect(ids(facts({}, parked, { status: 404 }))).toEqual(["page_http_error"]);
  });

  it("explains why HTTPS failed when the page was read over http", () => {
    const input = facts(
      {
        httpsFailure: {
          kind: "network",
          message: "EPROTO: write EPROTO ...:SSL routines:ssl3_read_bytes:tlsv1 alert internal error",
          url: URL_,
        },
      },
      CLEAN_HTML,
      { url: "http://www.clinicagarcia.es/" },
    );
    const finding = find(input, "not_https");
    expect(finding?.title).toBe("La conexión segura (HTTPS) no funciona");
    expect(finding?.evidence).toEqual([
      "https://www.clinicagarcia.es/: el certificado o la conexión segura (TLS) no funcionan",
      "Se leyó por http: http://www.clinicagarcia.es/",
    ]);
  });
});
