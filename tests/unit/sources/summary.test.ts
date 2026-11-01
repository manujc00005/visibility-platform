import { describe, expect, it } from "vitest";
import type { AnalyticsSummary } from "@/modules/analytics/summary";
import type { BingWebmasterSummary } from "@/modules/bing-webmaster/summary";
import type { AiSummary } from "@/modules/overview/ai";
import type { PerformanceSummary } from "@/modules/overview/performance";
import type { SearchConsoleSummary } from "@/modules/search-console/summary";
import { summarizeSources, type SourcesInput } from "@/modules/sources/summary";

/** The sources panel maps what each source already summarizes (feature 015, D002): no state is recalculated here. */

const AT = new Date("2026-10-30T18:38:00Z");
const READY = { state: "ready" as const, clientEmail: "visibility@demo.iam.gserviceaccount.com" };

const gsc = (over: Partial<SearchConsoleSummary> = {}): SearchConsoleSummary => ({
  state: "no_data",
  reason: "Pulsa «Traer datos de Search Console» para ver cómo te encuentran en Google.",
  property: null,
  period: null,
  capturedAt: null,
  metrics: null,
  totals: null,
  queries: [],
  pages: [],
  segments: null,
  lastFailure: null,
  ...over,
});
const bing = (over: Partial<BingWebmasterSummary> = {}): BingWebmasterSummary => ({
  state: "no_data",
  reason: "Pulsa «Traer datos de Bing» para ver cómo te encuentran en Bing.",
  siteUrl: null,
  period: null,
  previousPeriod: null,
  rows: null,
  capturedAt: null,
  metrics: null,
  queries: [],
  pages: [],
  lastFailure: null,
  configWarning: null,
  ...over,
});
const analytics = (over: Partial<AnalyticsSummary> = {}): AnalyticsSummary => ({
  state: "no_data",
  reason: "Pulsa «Traer datos de Analytics».",
  property: null,
  propertyName: null,
  period: null,
  previousPeriod: null,
  capturedAt: null,
  metrics: null,
  channels: [],
  pages: [],
  quality: null,
  lastFailure: null,
  configWarning: null,
  keyEvents: null,
  ...over,
});
const performance = (over: Partial<PerformanceSummary> = {}): PerformanceSummary => ({
  state: "no_data",
  score: null,
  tone: "neutral",
  verdict: "No medida",
  change: null,
  comparisonNote: null,
  measuredAt: null,
  reason: "Ejecuta la primera auditoría para medir la velocidad de la web.",
  topIssue: null,
  topIssueOriginal: false,
  field: { available: false, text: "", source: null },
  attempt: null,
  stale: null,
  auditId: null,
  ...over,
});
const ai = (over: Partial<AiSummary> = {}): AiSummary => ({
  state: "not_configured",
  coverage: null,
  citing: null,
  capture: null,
  configured: null,
  covered: [],
  uncovered: [],
  unanswered: [],
  branded: null,
  change: null,
  comparisonNote: null,
  measuredAt: null,
  provider: null,
  runId: null,
  attempt: null,
  setupNotice: null,
  activePrompts: 0,
  reason: "Añade preguntas que podrían hacer tus clientes para empezar a medir.",
  stale: null,
  nonRealOnly: false,
  ...over,
});

function input(over: Partial<SourcesInput> = {}): SourcesInput {
  return {
    workspaceId: "w1",
    searchConsole: { summary: gsc(), config: READY },
    bing: { summary: bing(), config: { state: "ready" } },
    analytics: { summary: analytics(), config: READY },
    pagespeed: { performance: performance(), config: { pageSpeed: true, crux: false } },
    ai: { summary: ai(), providers: { dataforseo: { available: false, reason: "La medición automática (DataForSEO) no está disponible en este entorno.", budgetMicros: null, reportable: false } } },
    ...over,
  };
}

describe("summarizeSources", () => {
  it("lists the five sources in order with their own labels, links and pending steps for a new company (AC-002, AC-003)", () => {
    const rows = summarizeSources(input());
    expect(rows.map((r) => r.key)).toEqual(["search_console", "bing", "analytics", "pagespeed", "ai"]);
    expect(rows.map((r) => r.status.label)).toEqual(["Sin datos", "Sin datos", "Sin datos", "Sin datos", "Sin configurar"]);
    expect(rows.map((r) => r.lastGood)).toEqual([null, null, null, null, null]);
    expect(rows.map((r) => r.action.href)).toEqual(["/workspaces/w1/seo#ranking-title", "/workspaces/w1/seo#bing-title", "/workspaces/w1/seo#analytics-title", "/workspaces/w1/performance", "/workspaces/w1/geo/setup"]);
    expect(rows[0]!.note).toMatch(/^Pulsa «Traer datos de Search Console»/);
    expect(rows[3]!.note).toBe("Ejecuta la primera auditoría para medir la velocidad de la web.");
    expect(rows[3]!.target).toBe("Clave de PageSpeed Insights (Chrome UX Report usa la misma)");
    expect(rows[4]!.target).toBe("Captura asistida (ChatGPT web)");
    // The reason of the state comes before the provider availability.
    expect(rows[4]!.note).toBe("Añade preguntas que podrían hacer tus clientes para empezar a medir.");
  });

  it("uses the section labels and tones of Search Console, Bing and GA4, with the property and the last good read (AC-002)", () => {
    const rows = summarizeSources(
      input({
        searchConsole: { summary: gsc({ state: "empty", reason: "Search Console no registra impresiones…", property: "sc-domain:olessium.com", capturedAt: AT }), config: READY },
        bing: { summary: bing({ state: "processing", reason: "Bing todavía no tiene datos…", siteUrl: "https://olessium.com/", capturedAt: AT }), config: { state: "ready" } },
        analytics: { summary: analytics({ state: "ok", reason: null, property: "properties/123", propertyName: "Olessium web", capturedAt: AT }), config: READY },
      }),
    );
    expect(rows[0]!.status).toEqual({ tone: "neutral", label: "Sin impresiones" });
    expect(rows[0]!.target).toBe("sc-domain:olessium.com");
    expect(rows[0]!.lastGood).toEqual(AT);
    expect(rows[0]!.note).toBe("Search Console no registra impresiones…");
    expect(rows[1]!.status).toEqual({ tone: "neutral", label: "Procesando" });
    expect(rows[1]!.target).toBe("https://olessium.com/");
    expect(rows[2]!.status).toEqual({ tone: "good", label: "Conectado" });
    expect(rows[2]!.target).toBe("Olessium web");
    expect(rows[2]!.note).toBeNull();
  });

  it("puts the last failure first, then the configuration warning, then the reason (AC-003)", () => {
    const rows = summarizeSources(
      input({
        searchConsole: { summary: gsc({ state: "ok", reason: null, property: "sc-domain:x.es", capturedAt: AT, lastFailure: { text: "La cuota de la API de Search Console está agotada.", at: AT } }), config: READY },
        analytics: { summary: analytics({ state: "empty", reason: "Google Analytics no tiene visitas…", capturedAt: AT, configWarning: "GSC_SERVICE_ACCOUNT_JSON no es un JSON válido. Se muestran los datos guardados." }), config: { state: "invalid", reason: "not_json" } },
        bing: { summary: bing({ state: "error", reason: "Bing rechazó la clave.", lastFailure: { text: "Bing rechazó la clave.", at: AT } }), config: { state: "ready" } },
      }),
    );
    expect(rows[0]!.note).toBe("La cuota de la API de Search Console está agotada.");
    expect(rows[0]!.status).toEqual({ tone: "good", label: "Conectado" });
    expect(rows[2]!.note).toMatch(/^GSC_SERVICE_ACCOUNT_JSON no es un JSON válido/);
    expect(rows[2]!.status).toEqual({ tone: "neutral", label: "Sin visitas" });
    expect(rows[1]!.status).toEqual({ tone: "bad", label: "Error" });
    expect(rows[1]!.note).toBe("Bing rechazó la clave.");
  });

  it("explains the credential states of Search Console", () => {
    const notConfigured = summarizeSources(input({ searchConsole: { summary: gsc({ state: "not_configured", reason: "Search Console no está configurado en la plataforma." }), config: { state: "not_configured" } } }))[0]!;
    expect(notConfigured.status).toEqual({ tone: "neutral", label: "Sin configurar" });
    expect(notConfigured.note).toBe("Search Console no está configurado en la plataforma.");
    const invalid = summarizeSources(input({ searchConsole: { summary: gsc({ state: "invalid_config", reason: "GSC_SERVICE_ACCOUNT_JSON no es un JSON válido, ni en crudo ni en base64." }), config: { state: "invalid", reason: "not_json" } } }))[0]!;
    expect(invalid.status).toEqual({ tone: "bad", label: "Configuración no válida" });
    const error = summarizeSources(input({ searchConsole: { summary: gsc({ state: "error", reason: "Añade visibility@… como usuario…", lastFailure: { text: "Añade visibility@… como usuario…", at: AT } }), config: READY } }))[0]!;
    expect(error.status).toEqual({ tone: "bad", label: "Error" });
    expect(error.note).toBe("Añade visibility@… como usuario…");
  });

  it("reads PageSpeed from the key and the latest audit: no key, measured, partial, analysing (AC-002)", () => {
    const noKey = summarizeSources(input({ pagespeed: { performance: performance({ state: "ok", score: 96, measuredAt: AT, reason: null }), config: { pageSpeed: false, crux: false } } }))[3]!;
    expect(noKey.status).toEqual({ tone: "neutral", label: "Sin configurar" });
    expect(noKey.target).toBeNull();
    expect(noKey.note).toBe("Falta la clave de PageSpeed Insights: la velocidad no se mide.");
    const measured = summarizeSources(input({ pagespeed: { performance: performance({ state: "ok", score: 96, measuredAt: AT, reason: null }), config: { pageSpeed: true, crux: true } } }))[3]!;
    expect(measured.status).toEqual({ tone: "good", label: "Medido" });
    expect(measured.target).toBe("Claves de PageSpeed Insights y de Chrome UX Report");
    expect(measured.lastGood).toEqual(AT);
    expect(measured.note).toBeNull();
    const partial = summarizeSources(input({ pagespeed: { performance: performance({ state: "partial", reason: "La cuota diaria de PageSpeed Insights se agotó en esta auditoría." }), config: { pageSpeed: true, crux: false } } }))[3]!;
    expect(partial.status).toEqual({ tone: "neutral", label: "No medida" });
    expect(partial.note).toBe("La cuota diaria de PageSpeed Insights se agotó en esta auditoría.");
    const analysing = summarizeSources(input({ pagespeed: { performance: performance({ state: "analyzing", reason: "Estamos midiendo la web." }), config: { pageSpeed: true, crux: false } } }))[3]!;
    expect(analysing.status).toEqual({ tone: "neutral", label: "Analizando" });
  });

  it("reads the AI measurement from the overview summary and the provider status (AC-002)", () => {
    const demoOnly = summarizeSources(input({ ai: { ...input().ai, summary: ai({ state: "no_data", nonRealOnly: true, activePrompts: 3, reason: "Solo hay mediciones de demostración o de prueba: no cuentan como resultado." }) } }))[4]!;
    expect(demoOnly.status).toEqual({ tone: "neutral", label: "Sin mediciones" });
    expect(demoOnly.note).toBe("Solo hay mediciones de demostración o de prueba: no cuentan como resultado.");
    const measured = summarizeSources(
      input({
        ai: {
          summary: ai({ state: "ok", reason: null, measuredAt: AT, provider: "Captura asistida (ChatGPT web)", coverage: { k: 1, n: 2 }, activePrompts: 2 }),
          providers: { dataforseo: { available: true, reason: null, budgetMicros: 5_000_000, reportable: false } },
        },
      }),
    )[4]!;
    expect(measured.status).toEqual({ tone: "good", label: "Medido" });
    expect(measured.target).toBe("Captura asistida (ChatGPT web) · DataForSEO · ChatGPT (interfaz)");
    expect(measured.lastGood).toEqual(AT);
    expect(measured.note).toBeNull();
    const collecting = summarizeSources(input({ ai: { ...input().ai, summary: ai({ state: "analyzing", reason: "Recogiendo respuestas de la primera medición." }) } }))[4]!;
    expect(collecting.status.label).toBe("Recogiendo respuestas");
  });

  it("translates names, labels and links into English", () => {
    const rows = summarizeSources(input({ searchConsole: { summary: gsc({ state: "empty", reason: "Search Console records no impressions…", property: "sc-domain:x.es", capturedAt: AT }), config: READY } }), "en");
    expect(rows.map((r) => r.name)).toEqual(["Google Search Console", "Bing Webmaster Tools", "Google Analytics 4", "PageSpeed Insights and Chrome UX Report", "ChatGPT measurement"]);
    expect(rows[0]!.status.label).toBe("No impressions");
    expect(rows[3]!.status.label).toBe("No data");
    expect(rows[3]!.target).toBe("PageSpeed Insights key (Chrome UX Report uses the same one)");
    expect(rows[4]!.status.label).toBe("Not set up");
    expect(rows[4]!.action.label).toBe("Set up the measurement");
  });
});
