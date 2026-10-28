import type { FieldDataResult } from "@/modules/audits/crux";
import { extractPage } from "@/modules/audits/html";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import type { AuditFacts } from "@/modules/audits/rules";

/**
 * Inputs of the findings regression corpus (SPEC «Contrato de hallazgos», T005). Together
 * the scenarios make `evaluateAudit` emit every rule id, the ten dynamic titles and both
 * `not_https` variants. The frozen inputs and outputs live in `findings-corpus.json`, captured
 * from the implementation that preceded the catalog; `findings-corpus.test.ts` checks that
 * this builder still produces those inputs and that `evaluateAudit` still produces those outputs.
 */

export const CORPUS_URL = "https://www.clinicagarcia.es/";

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

const FIELD: FieldDataResult = {
  status: "ok",
  formFactor: "PHONE",
  scope: "origin",
  key: "https://www.clinicagarcia.es",
  collectionPeriod: { firstDate: "2026-09-27", lastDate: "2026-10-24" },
  metrics: { lcpMs: 2100, inpMs: 150, cls: 0.05, fcpMs: 1500, ttfbMs: 600 },
  error: null,
};

type PageResult = Extract<AuditFacts["page"], { kind: "fetched" }>["result"];

function base(overrides: Partial<AuditFacts> = {}, html = CLEAN_HTML, pageOverrides: Partial<PageResult> = {}): AuditFacts {
  const url = pageOverrides.url ?? CORPUS_URL;
  return {
    requestedUrl: CORPUS_URL,
    httpsFailure: null,
    page: {
      kind: "fetched",
      result: {
        url,
        status: 200,
        contentType: "text/html; charset=utf-8",
        xRobotsTag: null,
        redirects: [],
        facts: extractPage(html, url),
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
      sitemap: { kind: "urlset", locCount: 12, sample: [CORPUS_URL], invalidLocCount: 0 },
      homepageListed: true,
    },
    performance: GOOD_PERF,
    ...overrides,
  };
}

function withRobots(patch: Partial<NonNullable<AuditFacts["robots"]>>): AuditFacts {
  const facts = base();
  facts.robots = { ...facts.robots!, ...patch };
  return facts;
}

function withSitemap(patch: Partial<NonNullable<AuditFacts["sitemap"]>>): AuditFacts {
  const facts = base();
  facts.sitemap = { ...facts.sitemap!, ...patch };
  return facts;
}

function withPerf(metrics: Partial<NonNullable<PerformanceResult["metrics"]>>): AuditFacts {
  return base({ performance: { ...GOOD_PERF, metrics: { ...GOOD_PERF.metrics!, ...metrics } } });
}

function withField(metrics: Partial<NonNullable<FieldDataResult["metrics"]>>): AuditFacts {
  return base({ fieldData: { ...FIELD, metrics: { ...FIELD.metrics!, ...metrics } } });
}

export function buildCorpusInputs(): Record<string, AuditFacts> {
  const unreachable: AuditFacts["page"] = {
    kind: "failed",
    failure: { kind: "dns", message: "getaddrinfo ENOTFOUND www.clinicagarcia.es", url: CORPUS_URL },
  };
  return {
    page_unreachable: base({ page: unreachable, robots: null, sitemap: null }),
    page_disallowed: (() => {
      const facts = base({ page: { kind: "disallowed" }, sitemap: null });
      facts.robots!.homepageAllowedForUs = false;
      return facts;
    })(),
    robots_blocks_homepage: withRobots({ homepageAllowedForGoogle: false }),
    robots_missing: withRobots({ status: "not_found", httpStatus: 404, sitemaps: [], homepageAllowedForGoogle: null, homepageAllowedForUs: null }),
    robots_error: withRobots({ status: "http_error", httpStatus: 503 }),
    sitemap_missing: withSitemap({ status: "not_found", httpStatus: 404, sitemap: null, homepageListed: null }),
    sitemap_invalid: withSitemap({ status: "invalid", error: "not_a_sitemap", sitemap: null, homepageListed: null }),
    sitemap_undeclared_empty: withSitemap({ source: "default", sitemap: { kind: "urlset", locCount: 0, sample: [], invalidLocCount: 0 }, homepageListed: false }),
    sitemap_invalid_urls: withSitemap({ sitemap: { kind: "index", locCount: 5, sample: [CORPUS_URL], invalidLocCount: 2 } }),
    page_http_error: base({}, CLEAN_HTML, { status: 503 }),
    page_not_html: base({}, '{"ok":true}', { contentType: "application/json" }),
    not_https_plain: base({}, CLEAN_HTML, { url: "http://www.clinicagarcia.es/" }),
    not_https_failed: base(
      {
        httpsFailure: {
          kind: "network",
          message: "EPROTO: write EPROTO ...:SSL routines:ssl3_read_bytes:tlsv1 alert internal error",
          url: CORPUS_URL,
        },
      },
      CLEAN_HTML,
      { url: "http://www.clinicagarcia.es/" },
    ),
    redirects_cross_host: base({}, CLEAN_HTML, {
      url: "https://clinica-garcia.com/",
      redirects: [
        { url: CORPUS_URL, status: 301, location: "https://clinicagarcia.es/" },
        { url: "https://clinicagarcia.es/", status: 302, location: "https://clinica-garcia.com/" },
      ],
    }),
    noindex: base({}, CLEAN_HTML, { xRobotsTag: "noindex, nofollow" }),
    nofollow: base({}, CLEAN_HTML.replace("<head>", '<head><meta name="robots" content="nofollow">')),
    canonicals: base(
      {},
      CLEAN_HTML.replace(
        '<link rel="canonical" href="https://www.clinicagarcia.es/">',
        '<link rel="canonical" href="https://clinicagarcia.es/inicio"><link rel="canonical" href="mailto:info@clinicagarcia.es">',
      ),
    ),
    metadata_long: base(
      {},
      CLEAN_HTML.replace(
        "<title>Clínica Dental García | Implantes en Valladolid</title>",
        "<title>Clínica Dental García | Implantes, ortodoncia invisible y blanqueamiento en Valladolid</title>",
      ).replace(
        'content="Clínica dental en Valladolid con implantes, ortodoncia invisible y odontología general. Pide tu primera cita sin coste."',
        'content="Clínica dental en Valladolid con implantes, ortodoncia invisible, blanqueamiento, odontología general, odontopediatría y urgencias. Pide tu primera cita sin coste y conoce al equipo de la clínica."',
      ),
    ),
    metadata_short_multiple: base(
      {},
      `<!doctype html><html lang="es"><head><title>Inicio</title><title>Clínica</title>
<meta name="description" content="Clínica en Valladolid"><meta name="description" content="Otra descripción">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://www.clinicagarcia.es/">
<meta property="og:title" content="x"><meta property="og:description" content="y"><meta property="og:image" content="https://www.clinicagarcia.es/og.jpg">
<script type="application/ld+json">{"@type":"Dentist"}</script></head>
<body><h1>Clínica</h1><h1>Dental</h1><h2>Servicios</h2><h4>Implantes</h4><a href="/contacto">Contacto</a></body></html>`,
    ),
    bare_page: base({}, "<html><head></head><body><p>Hola</p></body></html>"),
    structured_data: base(
      {},
      CLEAN_HTML.replace(
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Clínica Dental García"}</script>',
        '<script type="application/ld+json">{"@type":"WebPage"}</script><script type="application/ld+json">{not json}</script>',
      ),
    ),
    performance_error: base({ performance: { ...GOOD_PERF, status: "error", score: null, metrics: null, lighthouseVersion: null, error: "PageSpeed Insights: 500" } }),
    performance_slow_warning: withPerf({ lcpMs: 5000, cls: 0.3, tbtMs: 700 }),
    performance_slow_info: withPerf({ lcpMs: 3000, cls: 0.15, tbtMs: 300 }),
    field_poor: withField({ lcpMs: 4500, inpMs: 300, cls: 0.12 }),
    field_fair: withField({ inpMs: 300 }),
  };
}
