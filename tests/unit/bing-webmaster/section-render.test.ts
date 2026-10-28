import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RefreshBingWebmasterState } from "@/app/workspaces/[id]/seo/actions";
import { BingWebmasterSection } from "@/components/bing-webmaster/bing-webmaster-section";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { BingWebmasterConfig } from "@/modules/bing-webmaster/deps";
import type { BingWebmasterSnapshot } from "@/modules/bing-webmaster/schema";
import { summarizeBingWebmaster } from "@/modules/bing-webmaster/summary";
import { displayDay } from "@/modules/search-console/summary";

/**
 * What the Bing section paints (AC-002, AC-003, D009), rendered without a database: figures,
 * tables, both periods and the rows window with data; no button unless the key is ready.
 */

const READY: BingWebmasterConfig = { state: "ready" };
const INVALID: BingWebmasterConfig = { state: "invalid", reason: "bad_format" };
const noop = async (state: RefreshBingWebmasterState) => state;

function completed(overrides: Partial<BingWebmasterSnapshot> = {}): BingWebmasterSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "bing_wmt",
    captureCondition: "owner_api",
    siteUrl: "https://olessium.com/",
    currentStart: "2026-09-29",
    currentEnd: "2026-10-26",
    previousStart: "2026-09-01",
    previousEnd: "2026-09-28",
    totals: { clicks: 12, impressions: 400, ctr: 0.03 },
    previousTotals: { clicks: 8, impressions: 400, ctr: 0.02 },
    queries: [{ query: "ropa trail", clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }],
    pages: [{ page: "https://olessium.com/es/una-ruta-muy-larga-de-producto", clicks: 3, impressions: 30, ctr: 0.1, position: null }],
    rowsStart: "2026-05-01",
    rowsEnd: "2026-10-25",
    errorKind: null,
    errorMessage: null,
    verifiedSites: null,
    createdAt: new Date("2026-10-28T10:00:00Z"),
    ...overrides,
  };
}

function render(stored: BingWebmasterSnapshot | null, config: BingWebmasterConfig, locale: Locale = "es") {
  const s = summarizeBingWebmaster({ latest: stored, latestCompleted: stored }, config, "olessium.com", locale);
  return { s, html: renderToStaticMarkup(createElement(BingWebmasterSection, { s, config, action: noop, locale })) };
}

const t = getMessages("es").bingWebmaster;
const day = (iso: string, locale: Locale = "es") => displayDay(iso, locale);

describe("BingWebmasterSection", () => {
  it("paints figures, changes, both tables, both periods and the rows window", () => {
    const { s, html } = render(completed(), READY);
    expect(html).toContain(t.status.ok);
    expect(html).toContain(t.button.update);
    for (const key of ["clicks", "impressions", "ctr"] as const) {
      expect(html).toContain(s.metrics![key].value);
      expect(html).toContain(s.metrics![key].change!.text);
    }
    expect(html).toContain(t.tables.queries);
    expect(html).toContain("ropa trail");
    expect(html).toContain(t.tables.pages);
    expect(html).toContain("https://olessium.com/es/una-ruta-muy-larga-de-producto");
    expect(html).toContain("https://olessium.com/</span>");
    expect(html).toContain(`del ${day("2026-09-29")} al ${day("2026-10-26")}, comparado con los 28 días anteriores (del ${day("2026-09-01")} al ${day("2026-09-28")})`);
    expect(html).toContain(t.tables.window(day("2026-05-01"), day("2026-10-25")));
    expect(html).toContain(t.note);
    expect(html).not.toContain(t.setup.verify);
  });

  it("explains a partial success table by table", () => {
    const { html } = render(completed({ pages: [] }), READY);
    expect(html).toContain("ropa trail");
    expect(html).toContain(t.noPages);
    expect(html).not.toContain(t.noQueries);
  });

  it("offers no button with an invalid key and never repeats it", () => {
    const { html } = render(null, INVALID);
    expect(html).toContain(t.status.invalid_config);
    expect(html).toContain(t.reasons.invalidConfig.bad_format);
    expect(html).toContain("BING_WEBMASTER_API_KEY");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });

  it("keeps stored data with a warning and no button once the key breaks (D009)", () => {
    const { html } = render(completed(), INVALID);
    expect(html).toContain("ropa trail");
    expect(html).toContain(`${t.reasons.invalidConfig.bad_format} ${t.reasons.storedData}`);
    expect(html).toContain(t.setup.keyAfter);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
  });

  it("speaks English", () => {
    const en = getMessages("en").bingWebmaster;
    const { html } = render(completed(), READY, "en");
    expect(html).toContain(en.status.ok);
    expect(html).toContain(en.tables.queries);
    expect(html).toContain(en.tables.window(day("2026-05-01", "en"), day("2026-10-25", "en")));
  });
});
