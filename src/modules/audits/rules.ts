import type { FetchFailure } from "@/modules/audits/fetcher/safe-fetch";
import type { PageFacts } from "@/modules/audits/html";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import type { ParsedSitemap, SitemapParseError } from "@/modules/audits/sitemap";

/**
 * Turns the facts collected by an audit into findings. Pure function: no I/O.
 * There is deliberately no global score (B06): findings carry a severity, the evidence
 * that triggered them and an owner-friendly recommendation. Bump RULES_VERSION whenever
 * a rule, threshold or severity changes, so stored audits stay interpretable.
 */
export const RULES_VERSION = "2026-10-25.2";

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
      title: "No se pudo acceder a la página principal",
      evidence: [`${failure.url}: ${describeFailure(failure)}`, failure.message.slice(0, 200)],
      recommendation:
        "Comprueba que el dominio está activo y que la web carga desde fuera de tu red. Si la web funciona, contacta con nosotros: el resto de la auditoría depende de poder leerla.",
    });
  }
  if (facts.page.kind === "disallowed") {
    add({
      ruleId: "page_disallowed_for_audit",
      severity: "warning",
      category: "access",
      title: "robots.txt impide a nuestro analizador leer la página principal",
      evidence: [facts.robots?.url ?? "robots.txt"],
      recommendation: "Respetamos robots.txt. Si quieres el análisis completo, permite el acceso a la portada o pide una revisión asistida.",
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
        title: "robots.txt bloquea la página principal a Google",
        evidence: [robots.url],
        recommendation: "Elimina la regla Disallow que afecta a «/» para Googlebot o para todos los robots; mientras exista, Google no rastreará tu portada.",
      });
    }
    if (robots.status === "not_found") {
      add({
        ruleId: "robots_missing",
        severity: "info",
        category: "crawling",
        title: "No hay archivo robots.txt",
        evidence: [`${robots.url}: ${robots.httpStatus ?? "sin respuesta"}`],
        recommendation: "No es obligatorio, pero un robots.txt sencillo que indique la ubicación del sitemap ayuda a los buscadores.",
      });
    } else if (robots.status === "http_error" || robots.status === "fetch_failed") {
      add({
        ruleId: "robots_error",
        severity: "warning",
        category: "crawling",
        title: "robots.txt responde con error",
        evidence: [`${robots.url}: ${robots.httpStatus ?? robots.error ?? "error"}`],
        recommendation: "Un robots.txt que falla con error de servidor puede hacer que Google reduzca o pause el rastreo. Haz que responda 200 o 404.",
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
        title: "No se encontró un sitemap XML",
        evidence: [`${sitemap.url ?? "/sitemap.xml"}: ${sitemap.httpStatus ?? sitemap.error ?? "sin respuesta"}`],
        recommendation: "Publica un sitemap.xml con tus páginas importantes y decláralo en robots.txt y en Search Console.",
      });
    } else if (sitemap.status === "invalid") {
      add({
        ruleId: "sitemap_invalid",
        severity: "warning",
        category: "crawling",
        title: "El sitemap no es válido",
        evidence: [`${sitemap.url}: ${sitemap.error === "not_a_sitemap" ? "no es un sitemap XML (parece una página web)" : sitemap.error}`],
        recommendation: "Revisa que la URL del sitemap devuelva XML con el formato de sitemaps.org.",
      });
    } else if (sitemap.status === "ok" && sitemap.sitemap) {
      if (sitemap.source === "default" && robots?.status === "ok") {
        add({
          ruleId: "sitemap_not_declared",
          severity: "info",
          category: "crawling",
          title: "El sitemap no está declarado en robots.txt",
          evidence: [sitemap.url ?? ""],
          recommendation: "Añade una línea «Sitemap: <url>» en robots.txt para que todos los buscadores lo encuentren.",
        });
      }
      if (sitemap.sitemap.locCount === 0) {
        add({
          ruleId: "sitemap_empty",
          severity: "warning",
          category: "crawling",
          title: "El sitemap está vacío",
          evidence: [sitemap.url ?? ""],
          recommendation: "Incluye en el sitemap las URLs que quieres que aparezcan en Google.",
        });
      }
      if (sitemap.sitemap.invalidLocCount > 0) {
        add({
          ruleId: "sitemap_invalid_urls",
          severity: "info",
          category: "crawling",
          title: "El sitemap contiene URLs no válidas",
          evidence: [`${sitemap.sitemap.invalidLocCount} de ${sitemap.sitemap.locCount} entradas`],
          recommendation: "Cada <loc> debe ser una URL absoluta http o https.",
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
      title: `La página principal responde con error ${page.status}`,
      evidence: [`${page.url}: HTTP ${page.status}`],
      recommendation: "La portada debe responder 200. Un error impide que Google la indexe.",
    });
  }
  const isHtml = /text\/html|application\/xhtml\+xml/i.test(page.contentType ?? "");
  if (page.status < 400 && !isHtml) {
    add({
      ruleId: "page_not_html",
      severity: "critical",
      category: "access",
      title: "La página principal no devuelve HTML",
      evidence: [`Content-Type: ${page.contentType ?? "(sin cabecera)"}`],
      recommendation: "Revisa la configuración del servidor: la portada debe servirse como text/html.",
    });
  }
  if (new URL(page.url).protocol !== "https:") {
    const https = facts.httpsFailure;
    add({
      ruleId: "not_https",
      severity: "critical",
      category: "access",
      title: https ? "La conexión segura (HTTPS) no funciona" : "La web no usa HTTPS",
      evidence: https ? [`${https.url}: ${describeFailure(https)}`, `Se leyó por http: ${page.url}`] : [page.url],
      recommendation: "Activa un certificado SSL y redirige todo el tráfico http a https. Los navegadores marcan como «no seguras» las webs sin HTTPS.",
    });
  }
  if (page.redirects.length >= 2) {
    add({
      ruleId: "redirect_chain",
      severity: "info",
      category: "access",
      title: `La portada pasa por ${page.redirects.length} redirecciones`,
      evidence: [...page.redirects.map((r) => `${r.status} ${r.url} → ${r.location}`)],
      recommendation: "Redirige directamente a la URL final en un solo salto para cargar antes.",
    });
  }
  if (hostKey(page.url) !== hostKey(facts.requestedUrl)) {
    add({
      ruleId: "cross_host_redirect",
      severity: "warning",
      category: "access",
      title: "La web redirige a otro dominio",
      evidence: [`${facts.requestedUrl} → ${page.url}`],
      recommendation: "Comprueba que el dominio registrado es el principal de tu negocio; la auditoría analiza el dominio final.",
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
      title: "La página principal pide no ser indexada (noindex)",
      evidence: [
        ...f.metaRobots.map((value) => `<meta name="robots"> ${value}`),
        ...(page.xRobotsTag ? [`X-Robots-Tag: ${page.xRobotsTag}`] : []),
      ],
      recommendation: "Quita «noindex» de la portada: mientras esté, Google no la mostrará en los resultados.",
    });
  } else if (/\bnofollow\b/.test(directives)) {
    add({
      ruleId: "nofollow",
      severity: "warning",
      category: "indexability",
      title: "La página principal indica no seguir sus enlaces (nofollow)",
      evidence: f.metaRobots,
      recommendation: "Quita «nofollow» para que Google descubra el resto de páginas desde la portada.",
    });
  }
  if (f.canonicalCount === 0) {
    add({
      ruleId: "canonical_missing",
      severity: "warning",
      category: "indexability",
      title: "Falta la etiqueta canonical",
      evidence: [page.url],
      recommendation: "Añade <link rel=\"canonical\"> apuntando a la URL principal de la página para evitar duplicados.",
    });
  } else {
    if (f.canonicalCount > 1) {
      add({
        ruleId: "canonical_multiple",
        severity: "warning",
        category: "indexability",
        title: `Hay ${f.canonicalCount} etiquetas canonical`,
        evidence: f.canonicals,
        recommendation: "Deja una sola etiqueta canonical; con varias, Google puede ignorarlas todas.",
      });
    }
    if (f.canonicals.length < f.canonicalCount) {
      add({
        ruleId: "canonical_invalid",
        severity: "warning",
        category: "indexability",
        title: "La etiqueta canonical no contiene una URL válida",
        evidence: [`${f.canonicalCount - f.canonicals.length} canonical sin URL http(s) válida`],
        recommendation: "La canonical debe ser una URL absoluta http o https.",
      });
    }
    const first = f.canonicals[0];
    if (first && !sameUrl(first, page.url)) {
      add({
        ruleId: "canonical_other_url",
        severity: "warning",
        category: "indexability",
        title: "La canonical apunta a otra URL",
        evidence: [`Página: ${page.url}`, `Canonical: ${first}`],
        recommendation: "Si esta es la URL principal, la canonical debe apuntar a sí misma. Si no, comprueba que la URL indicada es la correcta y funciona.",
      });
    }
  }

  // --- Metadata ---------------------------------------------------------------------
  if (!f.title) {
    add({
      ruleId: "title_missing",
      severity: "critical",
      category: "metadata",
      title: "La página no tiene título",
      evidence: [page.url],
      recommendation: "Añade un <title> con tu marca y lo que ofreces, por ejemplo «Clínica Dental García | Implantes en Valladolid».",
    });
  } else {
    if (f.titleLength > 60) {
      add({
        ruleId: "title_too_long",
        severity: "info",
        category: "metadata",
        title: `El título es largo (${f.titleLength} caracteres)`,
        evidence: [f.title],
        recommendation: "Google suele cortar los títulos de más de ~60 caracteres. Pon lo importante al principio.",
      });
    } else if (f.titleLength < 15) {
      add({
        ruleId: "title_too_short",
        severity: "warning",
        category: "metadata",
        title: `El título es muy corto (${f.titleLength} caracteres)`,
        evidence: [f.title],
        recommendation: "Usa un título descriptivo con tu actividad y tu zona.",
      });
    }
  }
  if (f.titleCount > 1) {
    add({
      ruleId: "title_multiple",
      severity: "warning",
      category: "metadata",
      title: `Hay ${f.titleCount} etiquetas <title>`,
      evidence: [f.title ?? ""],
      recommendation: "Deja un único <title> por página.",
    });
  }
  if (!f.metaDescription) {
    add({
      ruleId: "description_missing",
      severity: "warning",
      category: "metadata",
      title: "Falta la meta descripción",
      evidence: [page.url],
      recommendation: "Escribe una descripción de 70–160 caracteres que invite a hacer clic; Google la usa a menudo como texto del resultado.",
    });
  } else if (f.metaDescriptionLength < 70 || f.metaDescriptionLength > 160) {
    add({
      ruleId: "description_length",
      severity: "info",
      category: "metadata",
      title: `La meta descripción mide ${f.metaDescriptionLength} caracteres`,
      evidence: [f.metaDescription],
      recommendation: "Lo habitual es entre 70 y 160 caracteres para que no se corte ni se quede corta.",
    });
  }
  if (f.metaDescriptionCount > 1) {
    add({
      ruleId: "description_multiple",
      severity: "info",
      category: "metadata",
      title: `Hay ${f.metaDescriptionCount} meta descripciones`,
      evidence: [f.metaDescription ?? ""],
      recommendation: "Deja una sola meta descripción por página.",
    });
  }
  if (!f.lang) {
    add({
      ruleId: "lang_missing",
      severity: "info",
      category: "metadata",
      title: "No se declara el idioma de la página",
      evidence: ["<html> sin atributo lang"],
      recommendation: "Añade lang=\"es\" (o el idioma correspondiente) a la etiqueta <html>.",
    });
  }

  // --- Headings -------------------------------------------------------------------
  if (f.headingCounts.h1 === 0) {
    add({
      ruleId: "h1_missing",
      severity: "warning",
      category: "headings",
      title: "La página no tiene encabezado H1",
      evidence: [f.headings.length ? `Primer encabezado: H${f.headings[0]!.level} «${f.headings[0]!.text}»` : "Sin encabezados"],
      recommendation: "Añade un H1 visible que diga qué ofreces y dónde.",
    });
  } else if (f.headingCounts.h1 > 1) {
    add({
      ruleId: "h1_multiple",
      severity: "info",
      category: "headings",
      title: `Hay ${f.headingCounts.h1} encabezados H1`,
      evidence: f.headings.filter((h) => h.level === 1).map((h) => `H1 «${h.text}»`),
      recommendation: "Lo recomendable es un único H1 con el tema principal de la página.",
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
      title: "La jerarquía de encabezados salta niveles",
      evidence: skips.slice(0, 5),
      recommendation: "Ordena los encabezados sin saltos (H1 → H2 → H3) para que la estructura sea clara.",
    });
  }

  // --- Links ----------------------------------------------------------------------
  if (f.links.internalCount === 0 && isHtml) {
    add({
      ruleId: "internal_links_none",
      severity: "warning",
      category: "links",
      title: "La portada no enlaza a otras páginas de la web",
      evidence: [`${f.links.externalCount} enlaces externos, 0 internos`],
      recommendation: "Enlaza desde la portada a tus servicios y contacto con enlaces HTML normales; si el menú se genera solo con JavaScript, Google puede no verlo.",
    });
  }

  // --- Mobile ---------------------------------------------------------------------
  if (!f.viewport && isHtml) {
    add({
      ruleId: "viewport_missing",
      severity: "warning",
      category: "mobile",
      title: "Falta la etiqueta viewport para móviles",
      evidence: [page.url],
      recommendation: "Añade <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> para que la web se adapte al móvil.",
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
      title: "Hay datos estructurados con errores de sintaxis",
      evidence: [`${sd.invalidJsonLdBlocks} de ${sd.jsonLdBlocks} bloques JSON-LD no se pueden leer`],
      recommendation: "Corrige el JSON-LD (por ejemplo con la prueba de resultados enriquecidos de Google).",
    });
  }
  if (!hasStructuredData && isHtml) {
    add({
      ruleId: "structured_data_missing",
      severity: "info",
      category: "structured_data",
      title: "No hay datos estructurados",
      evidence: ["Sin JSON-LD ni microdatos"],
      recommendation: "Añade datos estructurados de tu negocio (Organization o LocalBusiness con nombre, dirección y teléfono). Ayudan a Google y a los asistentes de IA a entender quién eres.",
    });
  } else if (hasStructuredData) {
    const allTypes = [...sd.types, ...sd.microdataTypes];
    if (!allTypes.some((type) => BUSINESS_TYPE.test(type))) {
      add({
        ruleId: "structured_data_no_business",
        severity: "info",
        category: "structured_data",
        title: "Los datos estructurados no describen al negocio",
        evidence: [`Tipos encontrados: ${allTypes.slice(0, 10).join(", ")}`],
        recommendation: "Añade un bloque Organization o LocalBusiness con los datos de tu empresa.",
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
      title: "Faltan etiquetas Open Graph",
      evidence: [`Faltan: ${missingOg.join(", ")}`],
      recommendation: "Añade título, descripción e imagen Open Graph para que la web se vea bien al compartirla en WhatsApp o redes sociales.",
    });
  }

  // --- Performance (lab, mobile) ------------------------------------------------------
  const perf = facts.performance;
  if (perf.status === "error") {
    add({
      ruleId: "performance_unavailable",
      severity: "info",
      category: "performance",
      title: "No se pudo medir el rendimiento",
      evidence: [perf.error ?? "Error de PageSpeed Insights"],
      recommendation: "Repite la auditoría más tarde para obtener las métricas de velocidad.",
    });
  } else if (perf.status === "ok" && perf.metrics) {
    const { lcpMs, cls, tbtMs } = perf.metrics;
    if (lcpMs !== null && lcpMs > 2500) {
      add({
        ruleId: "lcp_slow",
        severity: lcpMs > 4000 ? "warning" : "info",
        category: "performance",
        title: `El contenido principal tarda ${ms(lcpMs)} en aparecer en móvil`,
        evidence: [`LCP de laboratorio: ${ms(lcpMs)} (bueno: ≤ 2,5 s)`],
        recommendation: "Optimiza el tamaño de la imagen o bloque principal y el tiempo de respuesta del servidor.",
      });
    }
    if (cls !== null && cls > 0.1) {
      add({
        ruleId: "cls_high",
        severity: cls > 0.25 ? "warning" : "info",
        category: "performance",
        title: "La página se mueve mientras carga",
        evidence: [`CLS de laboratorio: ${cls.toLocaleString("es-ES", { maximumFractionDigits: 3 })} (bueno: ≤ 0,1)`],
        recommendation: "Reserva espacio para imágenes, anuncios y banners para que el contenido no salte.",
      });
    }
    if (tbtMs !== null && tbtMs > 200) {
      add({
        ruleId: "tbt_high",
        severity: tbtMs > 600 ? "warning" : "info",
        category: "performance",
        title: "La página tarda en responder a la interacción",
        evidence: [`Tiempo total de bloqueo: ${Math.round(tbtMs)} ms (bueno: ≤ 200 ms)`],
        recommendation: "Reduce el JavaScript que se carga al inicio (plugins, chats, scripts de terceros).",
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
