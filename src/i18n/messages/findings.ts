import type { FindingParams, FindingTemplate } from "@/i18n/findings";
import { formatNumber } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import type { AuditFacts } from "@/modules/audits/rules";

/**
 * Per-rule finding texts by language (SPEC «Contrato de hallazgos», D014).
 *
 * Spanish is the source: `evaluateAudit` builds new findings from these templates, so the
 * stored texts and the catalog never diverge. English is used at display time through
 * `findingText`. Dynamic rules read their historical value from the facts of the same audit
 * with the adapters below; an adapter returns `null` when the value is not there (absence is
 * never zero), which makes `findingText` fall back to the stored texts.
 */

type Fetched = Extract<AuditFacts["page"], { kind: "fetched" }>["result"];

function fetched(facts: AuditFacts): Fetched | null {
  return facts.page?.kind === "fetched" && facts.page.result ? facts.page.result : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function count(value: unknown): FindingParams | null {
  const n = num(value);
  return n === null ? null : { count: n };
}

function length(value: unknown): FindingParams | null {
  const n = num(value);
  return n === null ? null : { length: n };
}

/** «4,5 s» / «4.5 s»: the same shape `rules.ts` stores in Spanish. */
export function lcpSeconds(ms: number, locale: Locale): string {
  return `${formatNumber(ms / 1000, locale, { maximumFractionDigits: 1 })} s`;
}

/** Historical parameters of the dynamic titles, read from the stored facts (SPEC table). */
const adapters = {
  page_http_error: (facts: AuditFacts): FindingParams | null => {
    const status = num(fetched(facts)?.status);
    return status === null ? null : { status };
  },
  redirect_chain: (facts: AuditFacts): FindingParams | null => {
    const redirects = fetched(facts)?.redirects;
    return Array.isArray(redirects) ? { count: redirects.length } : null;
  },
  canonical_multiple: (facts: AuditFacts) => count(fetched(facts)?.facts?.canonicalCount),
  title_too_long: (facts: AuditFacts) => length(fetched(facts)?.facts?.titleLength),
  title_too_short: (facts: AuditFacts) => length(fetched(facts)?.facts?.titleLength),
  title_multiple: (facts: AuditFacts) => count(fetched(facts)?.facts?.titleCount),
  description_length: (facts: AuditFacts) => length(fetched(facts)?.facts?.metaDescriptionLength),
  description_multiple: (facts: AuditFacts) => count(fetched(facts)?.facts?.metaDescriptionCount),
  h1_multiple: (facts: AuditFacts) => count(fetched(facts)?.facts?.headingCounts?.h1),
  lcp_slow: (facts: AuditFacts, locale: Locale): FindingParams | null => {
    const lcp = num(facts.performance?.metrics?.lcpMs);
    return lcp === null ? null : { lcp: lcpSeconds(lcp, locale) };
  },
  /** Variant: HTTPS failed (a failure was recorded) or the site simply has no HTTPS. */
  not_https: (facts: AuditFacts): FindingParams | null =>
    facts.httpsFailure === undefined ? null : { httpsFailed: facts.httpsFailure !== null },
};

export const FINDINGS_ES = {
  page_unreachable: {
    title: "No se pudo acceder a la página principal",
    recommendation:
      "Comprueba que el dominio está activo y que la web carga desde fuera de tu red. Si la web funciona, contacta con nosotros: el resto de la auditoría depende de poder leerla.",
  },
  page_disallowed_for_audit: {
    title: "robots.txt impide a nuestro analizador leer la página principal",
    recommendation: "Respetamos robots.txt. Si quieres el análisis completo, permite el acceso a la portada o pide una revisión asistida.",
  },
  robots_blocks_homepage: {
    title: "robots.txt bloquea la página principal a Google",
    recommendation: "Elimina la regla Disallow que afecta a «/» para Googlebot o para todos los robots; mientras exista, Google no rastreará tu portada.",
  },
  robots_missing: {
    title: "No hay archivo robots.txt",
    recommendation: "No es obligatorio, pero un robots.txt sencillo que indique la ubicación del sitemap ayuda a los buscadores.",
  },
  robots_error: {
    title: "robots.txt responde con error",
    recommendation: "Un robots.txt que falla con error de servidor puede hacer que Google reduzca o pause el rastreo. Haz que responda 200 o 404.",
  },
  sitemap_missing: {
    title: "No se encontró un sitemap XML",
    recommendation: "Publica un sitemap.xml con tus páginas importantes y decláralo en robots.txt y en Search Console.",
  },
  sitemap_invalid: {
    title: "El sitemap no es válido",
    recommendation: "Revisa que la URL del sitemap devuelva XML con el formato de sitemaps.org.",
  },
  sitemap_not_declared: {
    title: "El sitemap no está declarado en robots.txt",
    recommendation: "Añade una línea «Sitemap: <url>» en robots.txt para que todos los buscadores lo encuentren.",
  },
  sitemap_empty: {
    title: "El sitemap está vacío",
    recommendation: "Incluye en el sitemap las URLs que quieres que aparezcan en Google.",
  },
  sitemap_invalid_urls: {
    title: "El sitemap contiene URLs no válidas",
    recommendation: "Cada <loc> debe ser una URL absoluta http o https.",
  },
  page_http_error: {
    params: adapters.page_http_error,
    title: (p: FindingParams) => `La página principal responde con error ${p.status}`,
    recommendation: "La portada debe responder 200. Un error impide que Google la indexe.",
  },
  page_not_html: {
    title: "La página principal no devuelve HTML",
    recommendation: "Revisa la configuración del servidor: la portada debe servirse como text/html.",
  },
  not_https: {
    params: adapters.not_https,
    title: (p: FindingParams) => (p.httpsFailed ? "La conexión segura (HTTPS) no funciona" : "La web no usa HTTPS"),
    recommendation: "Activa un certificado SSL y redirige todo el tráfico http a https. Los navegadores marcan como «no seguras» las webs sin HTTPS.",
  },
  redirect_chain: {
    params: adapters.redirect_chain,
    title: (p: FindingParams) => `La portada pasa por ${p.count} redirecciones`,
    recommendation: "Redirige directamente a la URL final en un solo salto para cargar antes.",
  },
  cross_host_redirect: {
    title: "La web redirige a otro dominio",
    recommendation: "Comprueba que el dominio registrado es el principal de tu negocio; la auditoría analiza el dominio final.",
  },
  noindex: {
    title: "La página principal pide no ser indexada (noindex)",
    recommendation: "Quita «noindex» de la portada: mientras esté, Google no la mostrará en los resultados.",
  },
  nofollow: {
    title: "La página principal indica no seguir sus enlaces (nofollow)",
    recommendation: "Quita «nofollow» para que Google descubra el resto de páginas desde la portada.",
  },
  canonical_missing: {
    title: "Falta la etiqueta canonical",
    recommendation: 'Añade <link rel="canonical"> apuntando a la URL principal de la página para evitar duplicados.',
  },
  canonical_multiple: {
    params: adapters.canonical_multiple,
    title: (p: FindingParams) => `Hay ${p.count} etiquetas canonical`,
    recommendation: "Deja una sola etiqueta canonical; con varias, Google puede ignorarlas todas.",
  },
  canonical_invalid: {
    title: "La etiqueta canonical no contiene una URL válida",
    recommendation: "La canonical debe ser una URL absoluta http o https.",
  },
  canonical_other_url: {
    title: "La canonical apunta a otra URL",
    recommendation: "Si esta es la URL principal, la canonical debe apuntar a sí misma. Si no, comprueba que la URL indicada es la correcta y funciona.",
  },
  title_missing: {
    title: "La página no tiene título",
    recommendation: "Añade un <title> con tu marca y lo que ofreces, por ejemplo «Clínica Dental García | Implantes en Valladolid».",
  },
  title_too_long: {
    params: adapters.title_too_long,
    title: (p: FindingParams) => `El título es largo (${p.length} caracteres)`,
    recommendation: "Google suele cortar los títulos de más de ~60 caracteres. Pon lo importante al principio.",
  },
  title_too_short: {
    params: adapters.title_too_short,
    title: (p: FindingParams) => `El título es muy corto (${p.length} caracteres)`,
    recommendation: "Usa un título descriptivo con tu actividad y tu zona.",
  },
  title_multiple: {
    params: adapters.title_multiple,
    title: (p: FindingParams) => `Hay ${p.count} etiquetas <title>`,
    recommendation: "Deja un único <title> por página.",
  },
  description_missing: {
    title: "Falta la meta descripción",
    recommendation: "Escribe una descripción de 70–160 caracteres que invite a hacer clic; Google la usa a menudo como texto del resultado.",
  },
  description_length: {
    params: adapters.description_length,
    title: (p: FindingParams) => `La meta descripción mide ${p.length} caracteres`,
    recommendation: "Lo habitual es entre 70 y 160 caracteres para que no se corte ni se quede corta.",
  },
  description_multiple: {
    params: adapters.description_multiple,
    title: (p: FindingParams) => `Hay ${p.count} meta descripciones`,
    recommendation: "Deja una sola meta descripción por página.",
  },
  lang_missing: {
    title: "No se declara el idioma de la página",
    recommendation: 'Añade lang="es" (o el idioma correspondiente) a la etiqueta <html>.',
  },
  h1_missing: {
    title: "La página no tiene encabezado H1",
    recommendation: "Añade un H1 visible que diga qué ofreces y dónde.",
  },
  h1_multiple: {
    params: adapters.h1_multiple,
    title: (p: FindingParams) => `Hay ${p.count} encabezados H1`,
    recommendation: "Lo recomendable es un único H1 con el tema principal de la página.",
  },
  heading_level_skip: {
    title: "La jerarquía de encabezados salta niveles",
    recommendation: "Ordena los encabezados sin saltos (H1 → H2 → H3) para que la estructura sea clara.",
  },
  internal_links_none: {
    title: "La portada no enlaza a otras páginas de la web",
    recommendation:
      "Enlaza desde la portada a tus servicios y contacto con enlaces HTML normales; si el menú se genera solo con JavaScript, Google puede no verlo.",
  },
  viewport_missing: {
    title: "Falta la etiqueta viewport para móviles",
    recommendation: 'Añade <meta name="viewport" content="width=device-width, initial-scale=1"> para que la web se adapte al móvil.',
  },
  structured_data_invalid: {
    title: "Hay datos estructurados con errores de sintaxis",
    recommendation: "Corrige el JSON-LD (por ejemplo con la prueba de resultados enriquecidos de Google).",
  },
  structured_data_missing: {
    title: "No hay datos estructurados",
    recommendation:
      "Añade datos estructurados de tu negocio (Organization o LocalBusiness con nombre, dirección y teléfono). Ayudan a Google y a los asistentes de IA a entender quién eres.",
  },
  structured_data_no_business: {
    title: "Los datos estructurados no describen al negocio",
    recommendation: "Añade un bloque Organization o LocalBusiness con los datos de tu empresa.",
  },
  open_graph_incomplete: {
    title: "Faltan etiquetas Open Graph",
    recommendation: "Añade título, descripción e imagen Open Graph para que la web se vea bien al compartirla en WhatsApp o redes sociales.",
  },
  performance_unavailable: {
    title: "No se pudo medir el rendimiento",
    recommendation: "Repite la auditoría más tarde para obtener las métricas de velocidad.",
  },
  lcp_slow: {
    params: adapters.lcp_slow,
    title: (p: FindingParams) => `El contenido principal tarda ${p.lcp} en aparecer en móvil`,
    recommendation: "Optimiza el tamaño de la imagen o bloque principal y el tiempo de respuesta del servidor.",
  },
  cls_high: {
    title: "La página se mueve mientras carga",
    recommendation: "Reserva espacio para imágenes, anuncios y banners para que el contenido no salte.",
  },
  tbt_high: {
    title: "La página tarda en responder a la interacción",
    recommendation: "Reduce el JavaScript que se carga al inicio (plugins, chats, scripts de terceros).",
  },
  field_cwv_failed: {
    title: "Los visitantes reales en móvil tienen una experiencia mejorable",
    recommendation: "Prioriza las métricas marcadas: son las que Google usa para valorar la experiencia real de la web.",
  },
} satisfies Record<string, FindingTemplate>;

export type FindingRuleId = keyof typeof FINDINGS_ES;

/** Every Spanish rule needs its English counterpart: a missing key fails `npm run typecheck`. */
export const FINDINGS_EN = {
  page_unreachable: {
    title: "The home page could not be reached",
    recommendation:
      "Check that the domain is active and that the website loads from outside your network. If the website works, contact us: the rest of the audit depends on being able to read it.",
  },
  page_disallowed_for_audit: {
    title: "robots.txt keeps our analyser from reading the home page",
    recommendation: "We respect robots.txt. If you want the full analysis, allow access to the home page or ask for an assisted review.",
  },
  robots_blocks_homepage: {
    title: "robots.txt blocks the home page for Google",
    recommendation: "Remove the Disallow rule that affects “/” for Googlebot or for all robots; while it exists, Google will not crawl your home page.",
  },
  robots_missing: {
    title: "There is no robots.txt file",
    recommendation: "It is not mandatory, but a simple robots.txt that points to the sitemap helps search engines.",
  },
  robots_error: {
    title: "robots.txt answers with an error",
    recommendation: "A robots.txt that fails with a server error can make Google reduce or pause crawling. Make it answer 200 or 404.",
  },
  sitemap_missing: {
    title: "No XML sitemap was found",
    recommendation: "Publish a sitemap.xml with your important pages and declare it in robots.txt and in Search Console.",
  },
  sitemap_invalid: {
    title: "The sitemap is not valid",
    recommendation: "Check that the sitemap URL returns XML in the sitemaps.org format.",
  },
  sitemap_not_declared: {
    title: "The sitemap is not declared in robots.txt",
    recommendation: "Add a “Sitemap: <url>” line to robots.txt so every search engine finds it.",
  },
  sitemap_empty: {
    title: "The sitemap is empty",
    recommendation: "List in the sitemap the URLs you want to appear on Google.",
  },
  sitemap_invalid_urls: {
    title: "The sitemap contains invalid URLs",
    recommendation: "Every <loc> must be an absolute http or https URL.",
  },
  page_http_error: {
    params: adapters.page_http_error,
    title: (p: FindingParams) => `The home page answers with error ${p.status}`,
    recommendation: "The home page must answer 200. An error keeps Google from indexing it.",
  },
  page_not_html: {
    title: "The home page does not return HTML",
    recommendation: "Check the server configuration: the home page must be served as text/html.",
  },
  not_https: {
    params: adapters.not_https,
    title: (p: FindingParams) => (p.httpsFailed ? "The secure connection (HTTPS) does not work" : "The website does not use HTTPS"),
    recommendation: "Enable an SSL certificate and redirect all http traffic to https. Browsers mark websites without HTTPS as “not secure”.",
  },
  redirect_chain: {
    params: adapters.redirect_chain,
    title: (p: FindingParams) => `The home page goes through ${p.count} redirects`,
    recommendation: "Redirect straight to the final URL in a single hop so the page loads sooner.",
  },
  cross_host_redirect: {
    title: "The website redirects to another domain",
    recommendation: "Check that the registered domain is your business's main one; the audit analyses the final domain.",
  },
  noindex: {
    title: "The home page asks not to be indexed (noindex)",
    recommendation: "Remove “noindex” from the home page: while it is there, Google will not show it in the results.",
  },
  nofollow: {
    title: "The home page asks not to follow its links (nofollow)",
    recommendation: "Remove “nofollow” so Google discovers the rest of the pages from the home page.",
  },
  canonical_missing: {
    title: "The canonical tag is missing",
    recommendation: 'Add <link rel="canonical"> pointing to the main URL of the page to avoid duplicates.',
  },
  canonical_multiple: {
    params: adapters.canonical_multiple,
    title: (p: FindingParams) => `There are ${p.count} canonical tags`,
    recommendation: "Keep a single canonical tag; with several, Google may ignore them all.",
  },
  canonical_invalid: {
    title: "The canonical tag does not contain a valid URL",
    recommendation: "The canonical must be an absolute http or https URL.",
  },
  canonical_other_url: {
    title: "The canonical points to another URL",
    recommendation: "If this is the main URL, the canonical must point to itself. If not, check that the URL given is the right one and works.",
  },
  title_missing: {
    title: "The page has no title",
    recommendation: "Add a <title> with your brand and what you offer, for example “García Dental Clinic | Implants in Valladolid”.",
  },
  title_too_long: {
    params: adapters.title_too_long,
    title: (p: FindingParams) => `The title is long (${p.length} characters)`,
    recommendation: "Google usually cuts titles longer than ~60 characters. Put what matters first.",
  },
  title_too_short: {
    params: adapters.title_too_short,
    title: (p: FindingParams) => `The title is very short (${p.length} characters)`,
    recommendation: "Use a descriptive title with your activity and your area.",
  },
  title_multiple: {
    params: adapters.title_multiple,
    title: (p: FindingParams) => `There are ${p.count} <title> tags`,
    recommendation: "Keep a single <title> per page.",
  },
  description_missing: {
    title: "The meta description is missing",
    recommendation: "Write a 70–160 character description that invites a click; Google often uses it as the result text.",
  },
  description_length: {
    params: adapters.description_length,
    title: (p: FindingParams) => `The meta description is ${p.length} characters long`,
    recommendation: "Between 70 and 160 characters is usual, so it is neither cut off nor too short.",
  },
  description_multiple: {
    params: adapters.description_multiple,
    title: (p: FindingParams) => `There are ${p.count} meta descriptions`,
    recommendation: "Keep a single meta description per page.",
  },
  lang_missing: {
    title: "The page language is not declared",
    recommendation: 'Add lang="es" (or the relevant language) to the <html> tag.',
  },
  h1_missing: {
    title: "The page has no H1 heading",
    recommendation: "Add a visible H1 that says what you offer and where.",
  },
  h1_multiple: {
    params: adapters.h1_multiple,
    title: (p: FindingParams) => `There are ${p.count} H1 headings`,
    recommendation: "A single H1 with the main topic of the page is recommended.",
  },
  heading_level_skip: {
    title: "The heading hierarchy skips levels",
    recommendation: "Order the headings without gaps (H1 → H2 → H3) so the structure is clear.",
  },
  internal_links_none: {
    title: "The home page does not link to other pages of the website",
    recommendation:
      "Link from the home page to your services and contact pages with regular HTML links; if the menu is built only with JavaScript, Google may not see it.",
  },
  viewport_missing: {
    title: "The viewport tag for mobile is missing",
    recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so the website adapts to mobile.',
  },
  structured_data_invalid: {
    title: "There is structured data with syntax errors",
    recommendation: "Fix the JSON-LD (for example with Google's rich results test).",
  },
  structured_data_missing: {
    title: "There is no structured data",
    recommendation:
      "Add structured data about your business (Organization or LocalBusiness with name, address and phone). It helps Google and AI assistants understand who you are.",
  },
  structured_data_no_business: {
    title: "The structured data does not describe the business",
    recommendation: "Add an Organization or LocalBusiness block with your company details.",
  },
  open_graph_incomplete: {
    title: "Open Graph tags are missing",
    recommendation: "Add an Open Graph title, description and image so the website looks good when shared on WhatsApp or social networks.",
  },
  performance_unavailable: {
    title: "Performance could not be measured",
    recommendation: "Run the audit again later to get the speed metrics.",
  },
  lcp_slow: {
    params: adapters.lcp_slow,
    title: (p: FindingParams) => `The main content takes ${p.lcp} to appear on mobile`,
    recommendation: "Optimise the size of the main image or block and the server response time.",
  },
  cls_high: {
    title: "The page shifts while loading",
    recommendation: "Reserve space for images, ads and banners so the content does not jump.",
  },
  tbt_high: {
    title: "The page is slow to respond to interaction",
    recommendation: "Reduce the JavaScript loaded at start (plugins, chats, third-party scripts).",
  },
  field_cwv_failed: {
    title: "Real mobile visitors get an experience that needs improvement",
    recommendation: "Prioritise the flagged metrics: they are the ones Google uses to judge the real experience of the website.",
  },
} satisfies Record<FindingRuleId, FindingTemplate>;

const CATALOGS: Record<Locale, Record<FindingRuleId, FindingTemplate>> = { es: FINDINGS_ES, en: FINDINGS_EN };

export function getFindingCatalog(locale: Locale): Record<FindingRuleId, FindingTemplate> {
  return CATALOGS[locale];
}
