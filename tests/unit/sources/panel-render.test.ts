import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourcesPanel } from "@/components/workspaces/sources-panel";
import { getMessages } from "@/i18n/messages";
import type { SourceRow } from "@/modules/sources/summary";

/** What the sources panel paints (feature 015, AC-004), rendered without a database. */

const AT = new Date("2026-10-30T18:38:00Z");
const rows: SourceRow[] = [
  { key: "search_console", name: "Google Search Console", status: { tone: "neutral", label: "Sin impresiones" }, target: "sc-domain:olessium.com", lastGood: AT, note: "Search Console no registra impresiones…", action: { label: "Ver en Google", href: "/workspaces/w1/seo#ranking-title" } },
  { key: "bing", name: "Bing Webmaster Tools", status: { tone: "neutral", label: "Procesando" }, target: "https://olessium.com/", lastGood: AT, note: null, action: { label: "Ver en Google", href: "/workspaces/w1/seo#bing-title" } },
  { key: "analytics", name: "Google Analytics 4", status: { tone: "good", label: "Conectado" }, target: "Olessium web", lastGood: AT, note: null, action: { label: "Ver en Google", href: "/workspaces/w1/seo#analytics-title" } },
  { key: "pagespeed", name: "PageSpeed Insights y Chrome UX Report", status: { tone: "neutral", label: "Sin configurar" }, target: null, lastGood: null, note: "Falta la clave de PageSpeed Insights: la velocidad no se mide.", action: { label: "Ver en Rendimiento", href: "/workspaces/w1/performance" } },
  { key: "ai", name: "Medición en ChatGPT", status: { tone: "neutral", label: "Sin mediciones" }, target: "Captura asistida (ChatGPT web)", lastGood: null, note: "<script>alert(1)</script>", action: { label: "Configurar la medición", href: "/workspaces/w1/geo/setup" } },
];

describe("SourcesPanel", () => {
  it("paints a captioned table with five rows, their pills, dates, notes and links, as text", () => {
    const html = renderToStaticMarkup(createElement(SourcesPanel, { rows, locale: "es" }));
    const t = getMessages("es").sources;
    expect(html).toContain(`<caption class="sr-only">${t.title}</caption>`);
    expect(html.split("<tr").length - 1).toBe(6);
    expect(html.split('scope="row"').length - 1).toBe(5);
    for (const row of rows) {
      expect(html).toContain(`>${row.status.label}</span>`);
      expect(html).toContain(`href="${row.action.href}"`);
    }
    expect(html).toContain("sc-domain:olessium.com");
    expect(html).toContain(`>${t.never}</td>`);
    expect(html.split(`>${t.never}</td>`).length - 1).toBe(2);
    expect(html).toContain("30 oct 2026");
    // A note is data: escaped, never markup.
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("GSC_SERVICE_ACCOUNT_JSON");
  });

  it("renders the English headings", () => {
    const html = renderToStaticMarkup(createElement(SourcesPanel, { rows, locale: "en" }));
    const t = getMessages("en").sources;
    expect(html).toContain(`>${t.title}</h2>`);
    expect(html).toContain(`>${t.columns.lastGood}</th>`);
    expect(html).toContain(`>${t.never}</td>`);
  });
});
