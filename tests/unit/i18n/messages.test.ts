import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/messages";
import { en } from "@/i18n/messages/en";
import { es } from "@/i18n/messages/es";

/**
 * Representative arguments for every function leaf of the catalogs, by dotted path. A
 * function without an entry here fails the test: each new message function must be
 * exercised in both languages.
 */
const FUNCTION_CALLS: Record<string, unknown[][]> = {
  "home.systemStatus.checkedAt": [["27 oct 2026, 13:34"]],
  "home.systemStatus.connected": [[12], [1234], [null]],
  "workspaces.errors.duplicateDomain": [["ejemplo.es"]],
  "validation.workspace.required": [["El nombre comercial"], ["The sector"]],
  "validation.workspace.maxLength": [["El nombre comercial", 120]],
  "validation.workspace.serviceMaxLength": [[80]],
  "validation.workspace.servicesMax": [[10]],
  "validation.workspace.cityMaxLength": [[120]],
  "audits.headline.critical": [[1], [3]],
  "audits.headline.warning": [[1], [2]],
  "audits.headline.infoDetail": [[1], [4]],
  "audits.page.title": [["clinicagarcia.es"]],
  "audits.page.rules": [["2026-10-26.1"]],
  "audits.page.report.template": [["2026-10-25.1"]],
  "audits.page.speed.labDescription": [["12.8.2"], [null]],
  "audits.page.speed.fieldDescription": [[null], [{ period: { first: "2026-09-27", last: "2026-10-24" }, scope: "origin" }], [{ period: null, scope: "url" }]],
  "audits.page.speed.good": [["≤ 2,5 s"]],
  "audits.page.technical.metadata.titleWithLength": [[42]],
  "audits.page.technical.metadata.descriptionWithLength": [[120]],
  "audits.page.technical.structured.jsonLdCount": [[2, 1]],
  "audits.page.technical.links.summary": [[12, 3, 0]],
  "audits.page.technical.crawling.sitemapWithUrls": [["index", 5], ["urlset", 12]],
  "overview.partial": [["Mal"]],
  "overview.cards.performance.fieldSource": [["Chrome UX Report · periodo"]],
  "overview.cards.performance.source": [["27 oct 2026, 13:34"]],
  "overview.cards.seo.critical": [[1], [2]],
  "overview.cards.seo.warning": [[1], [2]],
  "overview.cards.seo.source": [["27 oct 2026, 13:34"]],
  "overview.cards.ai.ofQuestions": [[1], [3]],
  "overview.cards.ai.cited": [[1, 1], [2, 5]],
  "overview.cards.ai.notMentioned": [["¿Qué clínica dental me recomiendas?"]],
  "overview.cards.ai.footnote.measured": [[1], [4]],
  "overview.cards.ai.footnote.captured": [[2, 3]],
  "overview.cards.ai.footnote.unanswered": [[1]],
  "overview.cards.ai.footnote.branded": [[1, 1, 1], [2, 1, 3]],
  "overview.cards.ai.source": [["Captura asistida · 27 oct 2026, 13:34"]],
  "overview.stale": [[1], [31]],
  "overview.performance.change": [["+10"], ["-12"]],
  "overview.performance.period": [["27 sept 2026", "24 oct 2026"]],
  "overview.performance.field": [["de esta página", "2,1 s", "bueno"]],
  "overview.performance.fieldSource": [["del 27 sept 2026 al 24 oct 2026"]],
  "overview.seo.fewer": [[1], [2]],
  "overview.seo.more": [[1], [3]],
  "overview.ai.before": [[1, 3]],
  "overview.ai.partialUnanswered": [[1], [6]],
  "overview.ai.partialEmpty": [[1], [2]],
  "overview.opportunity.speed.problem": [[40]],
  "overview.opportunity.speed.evidence": [[40, "malo"]],
  "overview.opportunity.ai.problem": [[1, 2]],
  "overview.opportunity.ai.evidence": [["Pregunta p0"]],
  "overview.opportunity.ai.source": [["Captura asistida (ChatGPT web)"]],
  "performancePage.source": [["27 oct 2026, 13:34", "12.8.2"], ["27 oct 2026, 13:34", null]],
  "performancePage.goodLabel": [["2,5 s o menos"]],
  "performancePage.field.line": [["Datos de esta página", "del 27 sept 2026 al 24 oct 2026"]],
  "performancePage.field.withLabOnly": [["Los datos de visitantes reales no están disponibles en esta medición."]],
  "overview.cards.ai.footnote.line": [["3 preguntas medidas · 1 sin respuesta válida"]],
  "performancePage.history.showing": [[12, 15]],
  "performancePage.history.breaks": [["versiones distintas de la prueba de Google"]],
  "performancePage.fullAudit": [["27 oct 2026, 13:34"]],
  "seoPage.health.source": [["27 oct 2026, 13:34"], [""]],
  "seoPage.history.summary": [[1, 2, 1, true], [0, 0, 3, false]],
  "seoPage.history.showing": [[12, 15]],
  "analytics.setup.run": [["Traer datos de Analytics"]],
  "analytics.reasons.noData": [["Traer datos de Analytics"]],
  "analytics.failures.no_access": [["gsc-reader@olessium.iam.gserviceaccount.com", "olessium.com"]],
  "analytics.failures.visibleProperties": [[0], [1], [3]],
  "analytics.failures.skipped": [[20]],
  "analytics.failures.lastAttempt": [["28 oct 2026, 19:40", "Vuelve a intentarlo."]],
  "analytics.units.users": [[1], [80]],
  "analytics.units.sessions": [[1], [120]],
  "analytics.units.views": [[1], [300]],
  "analytics.source.period": [["29 sept 2026", "26 oct 2026", "1 sept 2026", "28 sept 2026", "28 oct 2026, 19:40"]],
  "analytics.quality.intro": [["agrupó parte de los datos en «(other)»"]],
  "bingWebmaster.setup.run": [["Traer datos de Bing"]],
  "bingWebmaster.reasons.noData": [["Traer datos de Bing"]],
  "bingWebmaster.failures.no_access": [["olessium.com"]],
  "bingWebmaster.failures.verifiedSites": [[0], [1], [3]],
  "bingWebmaster.failures.not_verified": [["https://olessium.com/"]],
  "bingWebmaster.failures.lastAttempt": [["28 oct 2026, 19:40", "Vuelve a intentarlo."]],
  "bingWebmaster.source.period": [["29 sept 2026", "26 oct 2026", "1 sept 2026", "28 sept 2026", "28 oct 2026, 19:40"]],
  "bingWebmaster.source.captured": [["28 oct 2026, 19:40"]],
  "bingWebmaster.tables.window": [["1 may 2026", "25 oct 2026"]],
  "searchConsole.setup.run": [["Traer datos de Search Console"]],
  "searchConsole.reasons.noData": [["Traer datos de Search Console"]],
  "searchConsole.failures.no_access": [["gsc-reader@olessium.iam.gserviceaccount.com", "olessium.com"]],
  "searchConsole.failures.visibleProperties": [[0], [1], [3]],
  "searchConsole.failures.lastAttempt": [["27 oct 2026, 17:02", "Vuelve a intentarlo."]],
  "searchConsole.units.clicks": [[1], [12]],
  "searchConsole.units.impressions": [[1], [400]],
  "searchConsole.percent": [["3,0"]],
  "searchConsole.changes.before": [["0 clics"]],
  "searchConsole.changes.same": [["390 impresiones"]],
  "searchConsole.changes.signedPercent": [[50, "50"], [-18, "18"], [19900, "19,900"]],
  "searchConsole.changes.changed": [["8 clics", "+50"], ["1.500 clics", "−18"]],
  "searchConsole.changes.positionUp": [["12,1", "2,7"]],
  "searchConsole.changes.positionDown": [["8,1", "1,3"]],
  "searchConsole.changes.ctrChanged": [["1,4 %", "+0,6"]],
  "searchConsole.source.period": [["27 sept 2026", "24 oct 2026", "27 oct 2026, 17:02"], ["27 sept 2026", "24 oct 2026", ""]],
  "searchConsole.card.line": [["12 clics", "400 impresiones", "9,4"]],
  "chart.bar": [["27 oct 2026, 13:34", 1, 2, 3]],
  "geo.labels.fraction": [[3, 8, 38]],
  "geo.success.competitorAdded": [["Clínica Sonrisa"]],
  "geo.success.refreshed": [[3, 0], [3, 2]],
  "geo.success.candidates": [[1], [4]],
  "geo.success.suggestionAccepted": [["Clínica Sonrisa"]],
  "geo.validation.lineMax": [["alias", 80], ["fuente", 2000]],
  "geo.validation.linesMax": [["alias", 10], ["source", 30], ["fuente", 30]],
  "geo.validation.maxChars": [[120]],
  "geo.validation.invalidUrl": [["ftp://x"]],
  "geo.validation.questionMax": [[500]],
  "geo.validation.answerMaxChars": [["30.000"]],
  "geo.validation.sourceMax": [[2048]],
  "geo.validation.sourcesMax": [[20]],
  "geo.validation.sourceScheme": [["ftp://x"]],
  "geo.validation.sourceCredentials": [["https://u:p@x.es"]],
  "geo.validation.sourcePort": [["https://x.es:8080"]],
  "geo.validation.sourceHost": [["Introduce un dominio, no una dirección IP.", "http://10.0.0.1"]],
  "geo.page.description": [["Olessium", "olessium.com"]],
  "geo.page.count": [[1, 1, "answer"], [2, 3, "scheduled"], [0, 4, "question"]],
  "geo.page.empty.noRunsBody": [[1], [3]],
  "geo.page.ofEvaluated": [[1], [5]],
  "geo.page.brandedValue": [["1 de 1 respuesta"]],
  "geo.page.source": [["Captura asistida (ChatGPT web)", "25 oct 2026, 22:01", 3], ["x", "", 1]],
  "geo.page.visibility.of": [[1, 3]],
  "geo.page.comparison.yourBrand": [["Olessium"]],
  "geo.page.comparison.answers": [[1], [2]],
  "geo.page.history.appear": [["1 de 1 pregunta"]],
  "geo.page.history.cites": [["Sin datos"]],
  "geo.setup.description": [["olessium.com"]],
  "geo.setup.context.aliases": [["Oles"]],
  "geo.setup.context.services": [["CRM, automatización"]],
  "geo.setup.brand.description": [["Olessium", "olessium.com"]],
  "geo.setup.competitors.description": [[5]],
  "geo.setup.prompts.description": [[25]],
  "geo.setup.run.budget": [["5,00 USD"]],
  "geo.run.title": [["Olessium"]],
  "geo.run.meta": [
    [{ domain: "olessium.com", when: "25 oct 2026, 22:01", provider: "manual", status: "Completada", location: "Spain", language: "es", repetitions: 1, methodology: "geo-2026-10-25.1" }],
    [{ domain: "olessium.com", when: "25 oct 2026, 22:01", provider: "manual", status: "Completada", location: "Spain", language: "es", repetitions: 3, methodology: "geo-2026-10-25.1" }],
  ],
  "geo.run.comparison.yourBrand": [["Olessium"]],
  "geo.run.comparison.branded": [["1 de 1 (100 %)"]],
  "geo.run.answers.competitors": [["Clínica Sonrisa, K2 Dental"]],
};

type Leaf = { path: string; value: unknown };

function leaves(value: unknown, path = ""): Leaf[] {
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  }
  return [{ path, value }];
}

describe.each([
  ["es", es],
  ["en", en],
] as const)("catalog %s", (locale, catalog) => {
  it("is served by getMessages", () => {
    expect(getMessages(locale)).toBe(catalog);
  });

  it("has no empty strings", () => {
    for (const leaf of leaves(catalog)) {
      if (typeof leaf.value === "string") expect(leaf.value.trim(), leaf.path).not.toBe("");
    }
  });

  it("only holds strings and functions, and every function returns text for representative arguments", () => {
    for (const leaf of leaves(catalog)) {
      expect(["string", "function"], leaf.path).toContain(typeof leaf.value);
      if (typeof leaf.value !== "function") continue;
      const calls = FUNCTION_CALLS[leaf.path];
      expect(calls, `missing representative calls for ${leaf.path}`).toBeDefined();
      for (const args of calls!) {
        const result = (leaf.value as (...a: unknown[]) => unknown)(...args);
        expect(typeof result, `${leaf.path}(${JSON.stringify(args)})`).toBe("string");
        expect((result as string).trim()).not.toBe("");
      }
    }
  });
});

describe("catalog parity", () => {
  it("has the same leaf paths and leaf kinds in both languages", () => {
    const shape = (catalog: unknown) => leaves(catalog).map((l) => `${l.path}:${typeof l.value}`).sort();
    expect(shape(en)).toEqual(shape(es));
  });

  it("names each language in its own language", () => {
    expect(es.common.languages).toEqual({ es: "Español", en: "English" });
    expect(en.common.languages).toEqual({ es: "Español", en: "English" });
  });
});
