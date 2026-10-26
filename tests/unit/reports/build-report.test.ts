import { parse, type DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it } from "vitest";
import { extractPage } from "@/modules/audits/html";
import { emptyResult } from "@/modules/audits/pagespeed";
import { evaluateAudit, type AuditFacts } from "@/modules/audits/rules";
import { buildReportHtml, TEMPLATE_VERSION, type ReportInput } from "@/modules/reports/build-report";

const URL_ = "https://www.clinicagarcia.es/";
const HOSTILE = `<script>alert(1)</script><img src="http://127.0.0.1:9/x" onerror="alert(2)">`;

const PAGE_HTML = `<!doctype html><html><head><title>${HOSTILE}</title></head><body><h2>${HOSTILE}</h2></body></html>`;

function facts(overrides: Partial<AuditFacts> = {}): AuditFacts {
  return {
    requestedUrl: URL_,
    httpsFailure: null,
    page: {
      kind: "fetched",
      result: { url: URL_, status: 200, contentType: "text/html", xRobotsTag: null, redirects: [], facts: extractPage(PAGE_HTML, URL_) },
    },
    robots: {
      url: "https://www.clinicagarcia.es/robots.txt",
      status: "ok",
      httpStatus: 200,
      error: null,
      sitemaps: [],
      homepageAllowedForGoogle: true,
      homepageAllowedForUs: true,
    },
    sitemap: {
      url: "https://www.clinicagarcia.es/sitemap.xml",
      source: "default",
      status: "ok",
      httpStatus: 200,
      error: null,
      sitemap: { kind: "urlset", locCount: 3, sample: [URL_], invalidLocCount: 0 },
      homepageListed: true,
    },
    performance: emptyResult("not_configured"),
    ...overrides,
  };
}

function input(auditFacts: AuditFacts = facts(), name = `Clínica ${HOSTILE}`): ReportInput {
  return {
    workspace: {
      name,
      displayDomain: "clinicagarcia.es",
      sector: "Clínica dental",
      country: "España",
      city: "Valladolid",
      services: ["Implantes", `javascript:alert(3)`],
    },
    audit: {
      id: "d0d45fc2-0aec-47ec-b8ff-879f31912f95",
      startedAt: new Date("2026-10-25T19:18:00Z"),
      rulesVersion: "2026-10-25.2",
      requestedUrl: URL_,
      finalUrl: URL_,
      facts: auditFacts,
      findings: evaluateAudit(auditFacts),
      fetchLog: [{ url: `${URL_}?q=<script>`, outcome: "ok", status: 200, bytes: 10, ms: 120, ip: "93.184.216.34", error: null }],
    },
    generatedAt: new Date("2026-10-26T09:00:00Z"),
    geo: null,
  };
}

describe("buildReportHtml", () => {
  const document = buildReportHtml(input());

  it("contains every required section, the analysis date and the template version", () => {
    for (const heading of [
      "1. Resumen ejecutivo",
      "2. Datos de la empresa",
      "3. Resultados técnicos",
      "4. Problemas identificados",
      "5. Recomendaciones priorizadas",
      "6. Evidencias y fuentes",
      "7. Limitaciones de la medición",
    ]) {
      expect(document).toContain(`<h2>${heading}</h2>`);
    }
    expect(document).toContain("Fecha del análisis");
    // 19:18 UTC on 2026-10-25 is 20:18 in Madrid: summer time ended that night.
    expect(document).toContain("25 de octubre de 2026 a las 20:18");
    expect(document).toContain(`plantilla ${TEMPLATE_VERSION}`);
  });

  it("never emits active content: no scripts, event handlers, links, images or external resources", () => {
    // Structural check on the parsed document: escaped text such as "onerror=" is harmless,
    // what matters is that no element or attribute can run code or load a resource.
    type El = DefaultTreeAdapterMap["element"];
    const elements: El[] = [];
    const walk = (node: { childNodes?: unknown[] }) => {
      for (const child of (node.childNodes ?? []) as El[]) {
        if ("tagName" in child) elements.push(child);
        walk(child);
      }
    };
    walk(parse(document));
    const tags = new Set(elements.map((e) => e.tagName));
    for (const forbidden of ["script", "img", "iframe", "object", "embed", "link", "base", "form", "svg", "math", "video", "audio", "source"]) {
      expect(tags.has(forbidden)).toBe(false);
    }
    const attributes = elements.flatMap((e) => e.attrs.map((a) => a.name));
    expect(attributes.filter((name) => name.startsWith("on"))).toEqual([]);
    expect(attributes.filter((name) => ["src", "href", "action", "srcset", "poster", "background"].includes(name))).toEqual([]);
    const style = elements.find((e) => e.tagName === "style");
    const css = (style?.childNodes as { value?: string }[] | undefined)?.map((n) => n.value ?? "").join("") ?? "";
    expect(css.length).toBeGreaterThan(100);
    expect(css).not.toMatch(/url\(|@import/i);
  });

  it("shows hostile values as escaped text", () => {
    expect(document).toContain("Clínica &lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=&quot;http://127.0.0.1:9/x&quot; onerror=&quot;alert(2)&quot;&gt;");
    expect(document).toContain("javascript:alert(3)");
    expect(document).toContain("?q=&lt;script&gt;");
  });

  it("is deterministic", () => {
    expect(buildReportHtml(input())).toBe(document);
  });

  it("keeps the checks table consistent with the findings", () => {
    const rows = [...document.matchAll(/<tr><td>([^<]+)<\/td><td><span class="status (\w+)/g)].map((m) => [m[1], m[2]]);
    const byLabel = Object.fromEntries(rows);
    expect(byLabel["Título de la página"]).toBe("review");
    expect(byLabel["Conexión segura (HTTPS)"]).toBe("ok");
    expect(byLabel["Sitemap XML"]).toBe("review"); // sitemap_not_declared
    expect(byLabel["Velocidad en móvil (laboratorio)"]).toBe("unknown");
    expect(document).toContain("La velocidad de carga no se midió");
  });

  it("marks content checks as not verified when the home page could not be read", () => {
    const failed = facts({
      page: { kind: "failed", failure: { kind: "dns", message: "Could not resolve", url: URL_ } },
      robots: null,
      sitemap: null,
      performance: emptyResult("skipped"),
    });
    const report = buildReportHtml(input(failed, "Clínica García"));
    expect(report).toContain("No pudimos acceder a la portada");
    expect(report).toMatch(/Título de la página<\/td><td><span class="status unknown">No comprobado/);
    expect(report).toMatch(/La portada responde<\/td><td><span class="status review critical">Revisar/);
  });

  it("writes a positive summary when there are no findings", () => {
    const clean = `<!doctype html><html lang="es"><head><title>Clínica Dental García | Implantes en Valladolid</title>
<meta name="description" content="Clínica dental en Valladolid con implantes, ortodoncia invisible y odontología general. Pide tu primera cita sin coste.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="${URL_}">
<meta property="og:title" content="a"><meta property="og:description" content="b"><meta property="og:image" content="https://x/i.jpg">
<script type="application/ld+json">{"@type":"Dentist"}</script></head><body><h1>Clínica</h1><a href="/s">S</a></body></html>`;
    const cleanFacts = facts();
    cleanFacts.page = { kind: "fetched", result: { url: URL_, status: 200, contentType: "text/html", xRobotsTag: null, redirects: [], facts: extractPage(clean, URL_) } };
    cleanFacts.sitemap!.source = "robots";
    cleanFacts.robots!.sitemaps = [cleanFacts.sitemap!.url!];
    const report = buildReportHtml(input(cleanFacts, "Clínica García"));
    expect(report).toContain("No detectamos problemas");
    expect(report).not.toContain("Lo primero que recomendamos");
  });

  it("adds an AI-visibility section with fractions only, never answer texts, when a measurement is provided", () => {
    const withGeo = buildReportHtml({
      ...input(),
      geo: {
        measuredAt: new Date("2026-10-25T20:00:00Z"),
        method: "captura asistida",
        locationName: "Spain",
        languageCode: "es",
        repetitions: 1,
        brandName: `García ${HOSTILE}`,
        metrics: {
          capture: { k: 2, n: 2 },
          answers: { k: 2, n: 2 },
          brandPresence: { k: 1, n: 1 },
          citationRate: { k: 0, n: 1 },
          promptCoverage: { k: 1, n: 1 },
          branded: { k: 1, n: 1 },
          shareOfVoice: { total: 2, entries: [{ id: "brand", name: "Tu marca", k: 1 }, { id: "c1", name: "Vitaldent", k: 1 }] },
          perPrompt: [{ promptId: "p1", text: "¿Qué clínica me recomiendas?", intent: "discovery", scheduled: 1, captured: 1, answered: 1, brandMentions: 1, ownCitations: 0, competitorMentions: {} }],
        },
      },
    });
    expect(withGeo).toContain("<h2>7. Visibilidad en asistentes de IA (muestra)</h2>");
    expect(withGeo).toContain("<h2>8. Limitaciones de la medición</h2>");
    expect(withGeo).toContain("1 de 1 (100 %)");
    expect(withGeo).toContain("0 de 1 (0 %)");
    expect(withGeo).toContain("no equivalen a búsquedas reales");
    expect(withGeo).not.toMatch(/<script/i);
  });
});
