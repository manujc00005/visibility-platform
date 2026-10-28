import type { FetchFailure } from "@/modules/audits/fetcher/safe-fetch";
import type { PageFacts } from "@/modules/audits/html";
import { rateFieldMetric, type FieldDataResult, type FieldRating } from "@/modules/audits/crux";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import type { ParsedSitemap, SitemapParseError } from "@/modules/audits/sitemap";
import { FINDINGS_ES as T } from "@/i18n/messages/findings";

/**
 * Turns the facts collected by an audit into findings. Pure function: no I/O.
 * There is deliberately no global score (B06): findings carry a severity, the evidence
 * that triggered them and an owner-friendly recommendation. Bump RULES_VERSION whenever
 * a rule, threshold or severity changes, so stored audits stay interpretable. Titles and
 * recommendations come from the Spanish findings catalog (`FINDINGS_ES`); evidence lines are
 * built here, in Spanish, and stored as observed (they are never translated).
 */
export const RULES_VERSION = "2026-10-26.1";

export type Severity = "critical" | "warning" | "info";
export type Category =
  | "access"
  | "indexability"
  | "metadata"
  | "headings"
  | "crawling"
  | "links"
  | "structured_data"
  | "social"
  | "mobile"
  | "performance";

export interface Finding {
  ruleId: string;
  severity: Severity;
  category: Category;
  title: string;
  /** Plain-text evidence lines (values observed on the site). */
  evidence: string[];
  recommendation: string;
}

export interface PageResult {
  url: string;
  status: number;
  contentType: string | null;
  xRobotsTag: string | null;
  redirects: { url: string; status: number; location: string }[];
  facts: PageFacts | null;
}

export interface RobotsResult {
  url: string;
  status: "ok" | "not_found" | "http_error" | "fetch_failed";
  httpStatus: number | null;
  error: string | null;
  sitemaps: string[];
  /** null when there is no robots.txt to evaluate. */
  homepageAllowedForGoogle: boolean | null;
  homepageAllowedForUs: boolean | null;
}

export interface SitemapResultFacts {
  url: string | null;
  source: "robots" | "default" | null;
  status: "ok" | "not_found" | "http_error" | "fetch_failed" | "invalid";
  httpStatus: number | null;
  error: SitemapParseError | string | null;
  sitemap: ParsedSitemap | null;
  homepageListed: boolean | null;
}

export interface AuditFacts {
  requestedUrl: string;
  /** Why https:// failed when the home page was read over http:// instead. */
  httpsFailure: FetchFailure | null;
  /** Homepage outcome: fetched, failed, or not fetched because robots.txt forbids it. */
  page: { kind: "fetched"; result: PageResult } | { kind: "failed"; failure: FetchFailure } | { kind: "disallowed" };
  robots: RobotsResult | null;
  sitemap: SitemapResultFacts | null;
  performance: PerformanceResult;
  /** Real-user data (CrUX). Absent in audits stored before 2026-10-26. */
  fieldData?: FieldDataResult;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const CATEGORY_ORDER: Category[] = [
  "access",
  "indexability",
  "metadata",
  "headings",
  "crawling",
  "links",
  "mobile",
  "performance",
  "structured_data",
  "social",
];

const FAILURE_LABELS: Record<FetchFailure["kind"], string> = {
  invalid_url: "dirección no válida",
  blocked_destination: "el dominio apunta a una dirección no pública",
  dns: "el dominio no se pudo resolver (DNS)",
  network: "error de conexión",
  timeout: "la web no respondió a tiempo",
  too_many_redirects: "demasiadas redirecciones",
  too_large: "la página es demasiado grande",
  unsupported_encoding: "compresión no soportada",
  budget_exhausted: "límite de la auditoría alcanzado",
};

/** Owner-readable failure reason; raw TLS/OpenSSL errors become a plain sentence. */
function describeFailure(failure: FetchFailure): string {
  if (failure.kind === "network" && /SSL|TLS|CERT|EPROTO|handshake/i.test(failure.message)) {
    return "el certificado o la conexión segura (TLS) no funcionan";
  }
  return FAILURE_LABELS[failure.kind];
}

function hostKey(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function sameUrl(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  };
  return normalize(a) === normalize(b);
}

const BUSINESS_TYPE = /organization|localbusiness|corporation|store|restaurant|dentist|clinic|physician|attorney|legalservice|professionalservice|business|hotel|lodging|autorepair|contractor|plumber|electrician|realestate|medical|beauty|salon|gym|school/i;

function ms(value: number): string {
  return `${(value / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} s`;
}

export function evaluateAudit(facts: AuditFacts): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);

  // --- Access ---------------------------------------------------------------------
  if (facts.page.kind === "failed") {
    const { failure } = facts.page;
    add({
      ruleId: "page_unreachable",
      severity: "critical",
      category: "access",
      title: T.page_unreachable.title,
      evidence: [`${failure.url}: ${describeFailure(failure)}`, failure.message.slice(0, 200)],
      recommendation: T.page_unreachable.recommendation,
    });
  }
  if (facts.page.kind === "disallowed") {
    add({
      ruleId: "page_disallowed_for_audit",
      severity: "warning",
      category: "access",
      title: T.page_disallowed_for_audit.title,
      evidence: [facts.robots?.url ?? "robots.txt"],
      recommendation: T.page_disallowed_for_audit.recommendation,
    });
  }

  // --- Crawling: robots.txt and sitemap -------------------------------------------
  const robots = facts.robots;
  if (robots) {
    if (robots.homepageAllowedForGoogle === false) {
      add({
        ruleId: "robots_blocks_homepage",
        severity: "critical",
        category: "indexability",
        title: T.robots_blocks_homepage.title,
        evidence: [robots.url],
        recommendation: T.robots_blocks_homepage.recommendation,
      });
    }
    if (robots.status === "not_found") {
      add({
        ruleId: "robots_missing",
        severity: "info",
        category: "crawling",
        title: T.robots_missing.title,
        evidence: [`${robots.url}: ${robots.httpStatus ?? "sin respuesta"}`],
        recommendation: T.robots_missing.recommendation,
      });
    } else if (robots.status === "http_error" || robots.status === "fetch_failed") {
      add({
        ruleId: "robots_error",
        severity: "warning",
        category: "crawling",
        title: T.robots_error.title,
        evidence: [`${robots.url}: ${robots.httpStatus ?? robots.error ?? "error"}`],
        recommendation: T.robots_error.recommendation,
      });
    }
  }

  const sitemap = facts.sitemap;
  if (sitemap) {
    if (sitemap.status === "not_found" || sitemap.status === "http_error" || sitemap.status === "fetch_failed") {
      add({
        ruleId: "sitemap_missing",
        severity: "warning",
        category: "crawling",
        title: T.sitemap_missing.title,
        evidence: [`${sitemap.url ?? "/sitemap.xml"}: ${sitemap.httpStatus ?? sitemap.error ?? "sin respuesta"}`],
        recommendation: T.sitemap_missing.recommendation,
      });
    } else if (sitemap.status === "invalid") {
      add({
        ruleId: "sitemap_invalid",
        severity: "warning",
        category: "crawling",
        title: T.sitemap_invalid.title,
        evidence: [`${sitemap.url}: ${sitemap.error === "not_a_sitemap" ? "no es un sitemap XML (parece una página web)" : sitemap.error}`],
        recommendation: T.sitemap_invalid.recommendation,
      });
    } else if (sitemap.status === "ok" && sitemap.sitemap) {
      if (sitemap.source === "default" && robots?.status === "ok") {
        add({
          ruleId: "sitemap_not_declared",
          severity: "info",
          category: "crawling",
          title: T.sitemap_not_declared.title,
          evidence: [sitemap.url ?? ""],
          recommendation: T.sitemap_not_declared.recommendation,
        });
      }
      if (sitemap.sitemap.locCount === 0) {
        add({
          ruleId: "sitemap_empty",
          severity: "warning",
          category: "crawling",
          title: T.sitemap_empty.title,
          evidence: [sitemap.url ?? ""],
          recommendation: T.sitemap_empty.recommendation,
        });
      }
      if (sitemap.sitemap.invalidLocCount > 0) {
        add({
          ruleId: "sitemap_invalid_urls",
          severity: "info",
          category: "crawling",
          title: T.sitemap_invalid_urls.title,
          evidence: [`${sitemap.sitemap.invalidLocCount} de ${sitemap.sitemap.locCount} entradas`],
          recommendation: T.sitemap_invalid_urls.recommendation,
        });
      }
    }
  }

  if (facts.page.kind !== "fetched") return sortFindings(findings);
  const page = facts.page.result;

  // --- Response -------------------------------------------------------------------
  if (page.status >= 400) {
    add({
      ruleId: "page_http_error",
      severity: "critical",
      category: "access",
      title: T.page_http_error.title({ status: page.status }),
      evidence: [`${page.url}: HTTP ${page.status}`],
      recommendation: T.page_http_error.recommendation,
    });
  }
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(page.contentType ?? "");
  if (page.status < 400 && !isHtml) {
    add({
      ruleId: "page_not_html",
      severity: "critical",
      category: "access",
      title: T.page_not_html.title,
      evidence: [`Content-Type: ${page.contentType ?? "(sin cabecera)"}`],
      recommendation: T.page_not_html.recommendation,
    });
  }
  if (new URL(page.url).protocol !== "https:") {
    const https = facts.httpsFailure;
    add({
      ruleId: "not_https",
      severity: "critical",
      category: "access",
      title: T.not_https.title({ httpsFailed: https !== null }),
      evidence: https ? [`${https.url}: ${describeFailure(https)}`, `Se leyó por http: ${page.url}`] : [page.url],
      recommendation: T.not_https.recommendation,
    });
  }
  if (page.redirects.length >= 2) {
    add({
      ruleId: "redirect_chain",
      severity: "info",
      category: "access",
      title: T.redirect_chain.title({ count: page.redirects.length }),
      evidence: [...page.redirects.map((r) => `${r.status} ${r.url} → ${r.location}`)],
      recommendation: T.redirect_chain.recommendation,
    });
  }
  if (hostKey(page.url) !== hostKey(facts.requestedUrl)) {
    add({
      ruleId: "cross_host_redirect",
      severity: "warning",
      category: "access",
      title: T.cross_host_redirect.title,
      evidence: [`${facts.requestedUrl} → ${page.url}`],
      recommendation: T.cross_host_redirect.recommendation,
    });
  }

  // An error page's title, headings or links say nothing about the website: stop here.
  if (page.status >= 400) return sortFindings(findings);
  const f = page.facts;
  if (!f) return sortFindings(findings);

  // --- Indexability ---------------------------------------------------------------
  const directives = [...f.metaRobots, page.xRobotsTag ?? ""].join(",").toLowerCase();
  if (/\b(noindex|none)\b/.test(directives)) {
    add({
      ruleId: "noindex",
      severity: "critical",
      category: "indexability",
      title: T.noindex.title,
      evidence: [
        ...f.metaRobots.map((value) => `<meta name="robots"> ${value}`),
        ...(page.xRobotsTag ? [`X-Robots-Tag: ${page.xRobotsTag}`] : []),
      ],
      recommendation: T.noindex.recommendation,
    });
  } else if (/\bnofollow\b/.test(directives)) {
    add({
      ruleId: "nofollow",
      severity: "warning",
      category: "indexability",
      title: T.nofollow.title,
      evidence: f.metaRobots,
      recommendation: T.nofollow.recommendation,
    });
  }
  if (f.canonicalCount === 0) {
    add({
      ruleId: "canonical_missing",
      severity: "warning",
      category: "indexability",
      title: T.canonical_missing.title,
      evidence: [page.url],
      recommendation: T.canonical_missing.recommendation,
    });
  } else {
    if (f.canonicalCount > 1) {
      add({
        ruleId: "canonical_multiple",
        severity: "warning",
        category: "indexability",
        title: T.canonical_multiple.title({ count: f.canonicalCount }),
        evidence: f.canonicals,
        recommendation: T.canonical_multiple.recommendation,
      });
    }
    if (f.canonicals.length < f.canonicalCount) {
      add({
        ruleId: "canonical_invalid",
        severity: "warning",
        category: "indexability",
        title: T.canonical_invalid.title,
        evidence: [`${f.canonicalCount - f.canonicals.length} canonical sin URL http(s) válida`],
        recommendation: T.canonical_invalid.recommendation,
      });
    }
    const first = f.canonicals[0];
    if (first && !sameUrl(first, page.url)) {
      add({
        ruleId: "canonical_other_url",
        severity: "warning",
        category: "indexability",
        title: T.canonical_other_url.title,
        evidence: [`Página: ${page.url}`, `Canonical: ${first}`],
        recommendation: T.canonical_other_url.recommendation,
      });
    }
  }

  // --- Metadata ---------------------------------------------------------------------
  if (!f.title) {
    add({
      ruleId: "title_missing",
      severity: "critical",
      category: "metadata",
      title: T.title_missing.title,
      evidence: [page.url],
      recommendation: T.title_missing.recommendation,
    });
  } else {
    if (f.titleLength > 60) {
      add({
        ruleId: "title_too_long",
        severity: "info",
        category: "metadata",
        title: T.title_too_long.title({ length: f.titleLength }),
        evidence: [f.title],
        recommendation: T.title_too_long.recommendation,
      });
    } else if (f.titleLength < 15) {
      add({
        ruleId: "title_too_short",
        severity: "warning",
        category: "metadata",
        title: T.title_too_short.title({ length: f.titleLength }),
        evidence: [f.title],
        recommendation: T.title_too_short.recommendation,
      });
    }
  }
  if (f.titleCount > 1) {
    add({
      ruleId: "title_multiple",
      severity: "warning",
      category: "metadata",
      title: T.title_multiple.title({ count: f.titleCount }),
      evidence: [f.title ?? ""],
      recommendation: T.title_multiple.recommendation,
    });
  }
  if (!f.metaDescription) {
    add({
      ruleId: "description_missing",
      severity: "warning",
      category: "metadata",
      title: T.description_missing.title,
      evidence: [page.url],
      recommendation: T.description_missing.recommendation,
    });
  } else if (f.metaDescriptionLength < 70 || f.metaDescriptionLength > 160) {
    add({
      ruleId: "description_length",
      severity: "info",
      category: "metadata",
      title: T.description_length.title({ length: f.metaDescriptionLength }),
      evidence: [f.metaDescription],
      recommendation: T.description_length.recommendation,
    });
  }
  if (f.metaDescriptionCount > 1) {
    add({
      ruleId: "description_multiple",
      severity: "info",
      category: "metadata",
      title: T.description_multiple.title({ count: f.metaDescriptionCount }),
      evidence: [f.metaDescription ?? ""],
      recommendation: T.description_multiple.recommendation,
    });
  }
  if (!f.lang) {
    add({
      ruleId: "lang_missing",
      severity: "info",
      category: "metadata",
      title: T.lang_missing.title,
      evidence: ["<html> sin atributo lang"],
      recommendation: T.lang_missing.recommendation,
    });
  }

  // --- Headings -------------------------------------------------------------------
  if (f.headingCounts.h1 === 0) {
    add({
      ruleId: "h1_missing",
      severity: "warning",
      category: "headings",
      title: T.h1_missing.title,
      evidence: [f.headings.length ? `Primer encabezado: H${f.headings[0]!.level} «${f.headings[0]!.text}»` : "Sin encabezados"],
      recommendation: T.h1_missing.recommendation,
    });
  } else if (f.headingCounts.h1 > 1) {
    add({
      ruleId: "h1_multiple",
      severity: "info",
      category: "headings",
      title: T.h1_multiple.title({ count: f.headingCounts.h1 }),
      evidence: f.headings.filter((h) => h.level === 1).map((h) => `H1 «${h.text}»`),
      recommendation: T.h1_multiple.recommendation,
    });
  }
  const skips: string[] = [];
  f.headings.forEach((heading, index) => {
    const previous = f.headings[index - 1];
    if (previous && heading.level > previous.level + 1) {
      skips.push(`H${previous.level} «${previous.text}» → H${heading.level} «${heading.text}»`);
    }
  });
  if (skips.length > 0) {
    add({
      ruleId: "heading_level_skip",
      severity: "info",
      category: "headings",
      title: T.heading_level_skip.title,
      evidence: skips.slice(0, 5),
      recommendation: T.heading_level_skip.recommendation,
    });
  }

  // --- Links ----------------------------------------------------------------------
  if (f.links.internalCount === 0 && isHtml) {
    add({
      ruleId: "internal_links_none",
      severity: "warning",
      category: "links",
      title: T.internal_links_none.title,
      evidence: [`${f.links.externalCount} enlaces externos, 0 internos`],
      recommendation: T.internal_links_none.recommendation,
    });
  }

  // --- Mobile ---------------------------------------------------------------------
  if (!f.viewport && isHtml) {
    add({
      ruleId: "viewport_missing",
      severity: "warning",
      category: "mobile",
      title: T.viewport_missing.title,
      evidence: [page.url],
      recommendation: T.viewport_missing.recommendation,
    });
  }

  // --- Structured data --------------------------------------------------------------
  const sd = f.structuredData;
  const hasStructuredData = sd.jsonLdBlocks - sd.invalidJsonLdBlocks > 0 || sd.microdataTypes.length > 0;
  if (sd.invalidJsonLdBlocks > 0) {
    add({
      ruleId: "structured_data_invalid",
      severity: "warning",
      category: "structured_data",
      title: T.structured_data_invalid.title,
      evidence: [`${sd.invalidJsonLdBlocks} de ${sd.jsonLdBlocks} bloques JSON-LD no se pueden leer`],
      recommendation: T.structured_data_invalid.recommendation,
    });
  }
  if (!hasStructuredData && isHtml) {
    add({
      ruleId: "structured_data_missing",
      severity: "info",
      category: "structured_data",
      title: T.structured_data_missing.title,
      evidence: ["Sin JSON-LD ni microdatos"],
      recommendation: T.structured_data_missing.recommendation,
    });
  } else if (hasStructuredData) {
    const allTypes = [...sd.types, ...sd.microdataTypes];
    if (!allTypes.some((type) => BUSINESS_TYPE.test(type))) {
      add({
        ruleId: "structured_data_no_business",
        severity: "info",
        category: "structured_data",
        title: T.structured_data_no_business.title,
        evidence: [`Tipos encontrados: ${allTypes.slice(0, 10).join(", ")}`],
        recommendation: T.structured_data_no_business.recommendation,
      });
    }
  }

  // --- Social -----------------------------------------------------------------------
  const missingOg = ["og:title", "og:description", "og:image"].filter((key) => !f.openGraph[key]);
  if (missingOg.length > 0 && isHtml) {
    add({
      ruleId: "open_graph_incomplete",
      severity: "info",
      category: "social",
      title: T.open_graph_incomplete.title,
      evidence: [`Faltan: ${missingOg.join(", ")}`],
      recommendation: T.open_graph_incomplete.recommendation,
    });
  }

  // --- Performance (lab, mobile) ------------------------------------------------------
  const perf = facts.performance;
  if (perf.status === "error") {
    add({
      ruleId: "performance_unavailable",
      severity: "info",
      category: "performance",
      title: T.performance_unavailable.title,
      evidence: [perf.error ?? "Error de PageSpeed Insights"],
      recommendation: T.performance_unavailable.recommendation,
    });
  } else if (perf.status === "ok" && perf.metrics) {
    const { lcpMs, cls, tbtMs } = perf.metrics;
    if (lcpMs !== null && lcpMs > 2500) {
      add({
        ruleId: "lcp_slow",
        severity: lcpMs > 4000 ? "warning" : "info",
        category: "performance",
        title: T.lcp_slow.title({ lcp: ms(lcpMs) }),
        evidence: [`LCP de laboratorio: ${ms(lcpMs)} (bueno: ≤ 2,5 s)`],
        recommendation: T.lcp_slow.recommendation,
      });
    }
    if (cls !== null && cls > 0.1) {
      add({
        ruleId: "cls_high",
        severity: cls > 0.25 ? "warning" : "info",
        category: "performance",
        title: T.cls_high.title,
        evidence: [`CLS de laboratorio: ${cls.toLocaleString("es-ES", { maximumFractionDigits: 3 })} (bueno: ≤ 0,1)`],
        recommendation: T.cls_high.recommendation,
      });
    }
    if (tbtMs !== null && tbtMs > 200) {
      add({
        ruleId: "tbt_high",
        severity: tbtMs > 600 ? "warning" : "info",
        category: "performance",
        title: T.tbt_high.title,
        evidence: [`Tiempo total de bloqueo: ${Math.round(tbtMs)} ms (bueno: ≤ 200 ms)`],
        recommendation: T.tbt_high.recommendation,
      });
    }
  }

  // --- Real-user experience (CrUX, phones, 28 days) ------------------------------------
  const field = facts.fieldData;
  if (field?.status === "ok" && field.metrics) {
    const { lcpMs, inpMs, cls } = field.metrics;
    const rated: { label: string; value: string; good: string; rating: FieldRating }[] = [];
    if (lcpMs !== null) rated.push({ label: "Carga del contenido principal (LCP)", value: ms(lcpMs), good: "≤ 2,5 s", rating: rateFieldMetric("lcp", lcpMs) });
    if (inpMs !== null) rated.push({ label: "Respuesta a la interacción (INP)", value: `${Math.round(inpMs)} ms`, good: "≤ 200 ms", rating: rateFieldMetric("inp", inpMs) });
    if (cls !== null) {
      rated.push({ label: "Estabilidad visual (CLS)", value: cls.toLocaleString("es-ES", { maximumFractionDigits: 2 }), good: "≤ 0,1", rating: rateFieldMetric("cls", cls) });
    }
    const failing = rated.filter((r) => r.rating !== "good");
    if (failing.length > 0) {
      const scope = field.scope === "url" ? "esta página" : "toda la web";
      const period = field.collectionPeriod ? ` (${field.collectionPeriod.firstDate} a ${field.collectionPeriod.lastDate})` : "";
      add({
        ruleId: "field_cwv_failed",
        severity: failing.some((r) => r.rating === "poor") ? "warning" : "info",
        category: "performance",
        title: T.field_cwv_failed.title,
        evidence: [
          ...failing.map((r) => `${r.label}: ${r.value}, ${r.rating === "poor" ? "mala" : "mejorable"} (bueno: ${r.good})`),
          `Datos de usuarios de Chrome en móvil, percentil 75, últimos 28 días${period}, de ${scope}`,
        ],
        recommendation: T.field_cwv_failed.recommendation,
      });
    }
  }

  return sortFindings(findings);
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
