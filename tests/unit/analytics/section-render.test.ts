import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RefreshAnalyticsState } from "@/app/workspaces/[id]/seo/actions";
import { AnalyticsSection } from "@/components/analytics/analytics-section";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { AnalyticsConfig } from "@/modules/analytics/deps";
import type { AnalyticsSnapshot } from "@/modules/analytics/schema";
import { summarizeAnalytics } from "@/modules/analytics/summary";
import { displayDay } from "@/modules/search-console/summary";

/**
 * What the Analytics section paints (AC-001–AC-005, AC-008), rendered without a database:
 * figures, channel and page tables, both periods and quality notices; no button unless the
 * credential is ready (D007).
 */

const EMAIL = "gsc-reader@olessium.iam.gserviceaccount.com";
const READY: AnalyticsConfig = { state: "ready", clientEmail: EMAIL };
const INVALID: AnalyticsConfig = { state: "invalid", reason: "not_json" };
const noop = async (state: RefreshAnalyticsState) => state;

function completed(overrides: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "ga4",
    captureCondition: "owner_api",
    property: "properties/123",
    propertyName: "Olessium <b>web</b>",
    currentStart: "2026-09-29",
    currentEnd: "2026-10-26",
    previousStart: "2026-09-01",
    previousEnd: "2026-09-28",
    totals: { users: 80, sessions: 120, views: 300 },
    previousTotals: { users: 60, sessions: 100, views: 250 },
    channels: [{ channel: "Organic Search", sessions: 70, previousSessions: 50 }],
    pages: [{ page: "/es/una-ruta-muy-larga-de-producto", views: 200, users: 70 }],
    quality: { otherRow: false, thresholded: true, sampled: false },
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    propertiesSkipped: null,
    keyEvents: null,
    createdAt: new Date("2026-10-28T10:00:00Z"),
    ...overrides,
  };
}

function render(stored: AnalyticsSnapshot | null, config: AnalyticsConfig, locale: Locale = "es") {
  const s = summarizeAnalytics({ latest: stored, latestCompleted: stored }, config, "olessium.com", locale);
  return { s, html: renderToStaticMarkup(createElement(AnalyticsSection, { s, config, action: noop, locale })) };
}

const t = getMessages("es").analytics;
const day = (iso: string, locale: Locale = "es") => displayDay(iso, locale);

describe("AnalyticsSection", () => {
  it("paints figures, changes, both tables, property, both periods and quality", () => {
    const { s, html } = render(completed(), READY);
    expect(html).toContain(t.status.ok);
    expect(html).toContain(t.button.update);
    for (const key of ["users", "sessions", "views"] as const) {
      expect(html).toContain(s.metrics![key].change!.text);
    }
    expect(html).toContain(t.tables.channels);
    expect(html).toContain("Organic Search");
    expect(html).toContain("Antes: 50 sesiones (+40 %)");
    expect(html).toContain(t.tables.pages);
    expect(html).toContain("/es/una-ruta-muy-larga-de-producto");
    expect(html).toContain("Olessium &lt;b&gt;web&lt;/b&gt; (properties/123)");
    expect(html).not.toContain("<b>web</b>");
    expect(html).toContain(`del ${day("2026-09-29")} al ${day("2026-10-26")}, comparado con los 28 días anteriores (del ${day("2026-09-01")} al ${day("2026-09-28")})`);
    expect(html).toContain(t.quality.thresholded);
    expect(html).toContain(t.note);
    expect(html).not.toContain(t.setup.apis);
  });

  it("explains an empty table on its own", () => {
    const { html } = render(completed({ pages: [] }), READY);
    expect(html).toContain("Organic Search");
    expect(html).toContain(t.noPages);
    expect(html).not.toContain(t.noChannels);
  });

  it("shows the no-visits state with the update button and no tables", () => {
    const zero = { users: 0, sessions: 0, views: 0 };
    const { html } = render(completed({ totals: zero, previousTotals: zero, channels: [], pages: [] }), READY);
    expect(html).toContain(t.status.empty);
    expect(html).toContain(t.reasons.empty);
    expect(html).toContain(t.button.update);
    expect(html).not.toContain(t.tables.channels);
  });

  it("shows the setup steps with the service account email when nothing is stored", () => {
    const { html } = render(null, READY);
    expect(html).toContain(t.button.fetch);
    expect(render(null, { state: "not_configured" }).html).toContain("GSC_SERVICE_ACCOUNT_JSON");
    const failedHtml = renderToStaticMarkup(
      createElement(AnalyticsSection, {
        s: summarizeAnalytics(
          { latest: completed({ status: "failed", errorKind: "data_api_disabled", errorMessage: "x", property: null, totals: null, previousTotals: null, quality: null }), latestCompleted: null },
          READY,
          "olessium.com",
        ),
        config: READY,
        action: noop,
        locale: "es",
      }),
    );
    expect(failedHtml).toContain(t.failures.data_api_disabled);
    expect(failedHtml).toContain(EMAIL);
    expect(failedHtml).toContain(t.setup.apis);
  });

  it("offers no button with an invalid credential, with or without stored data (D007)", () => {
    const { html } = render(null, INVALID);
    expect(html).toContain(t.status.invalid_config);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    const stored = render(completed(), INVALID).html;
    expect(stored).toContain("Organic Search");
    expect(stored).toContain(t.reasons.storedData);
    expect(stored).not.toContain("<button");
  });

  it("speaks English", () => {
    const en = getMessages("en").analytics;
    const { html } = render(completed(), READY, "en");
    expect(html).toContain(en.tables.channels);
    expect(html).toContain("Before: 50 sessions (+40%)");
    expect(html).toContain(en.quality.thresholded);
  });
});

describe("AnalyticsSection key events (feature 008)", () => {
  const KE = {
    version: 1 as const,
    configured: ["generate_lead", "purchase"],
    configuredMore: false,
    total: 100,
    previousTotal: 80,
    organic: 25,
    previousOrganic: 20,
    organicByEvent: [{ event: "generate_lead", keyEvents: 18 }],
  };
  const k = t.keyEvents;
  const zero = { users: 0, sessions: 0, views: 0 };

  it("paints both figures, their changes, the share, the breakdown and the configured events (AC-001, AC-008)", () => {
    const { html } = render(completed({ keyEvents: KE }), READY);
    expect(html).toContain(k.title);
    expect(html).toContain(k.scope);
    expect(html).toContain(`>${k.organic.label}</dt>`);
    expect(html).toContain(`>${k.total.label}</dt>`);
    expect(html).toContain("Antes: 20 eventos clave (+25 %)");
    expect(html).toContain(k.share("25,0 %"));
    expect(html).toContain(k.table.caption);
    expect(html).toContain(">generate_lead</td>");
    expect(html).toContain(k.configured);
    expect(html).toContain(">purchase</span>");
    expect(html).toContain(k.limits);
    expect(html).not.toContain(k.noneConfigured);
    expect(html).not.toContain(k.missing(t.button.update));
  });

  it("explains how to mark key events, without figures, when none are configured (AC-007)", () => {
    const { html } = render(completed({ keyEvents: { ...KE, configured: [] } }), READY);
    expect(html).toContain(k.noneConfigured);
    expect(html).not.toContain(`>${k.organic.label}</dt>`);
    expect(html).not.toContain(k.table.caption);
  });

  it("says GA4 returned no key events when both periods are zero, with zero figures (AC-007)", () => {
    const { html } = render(completed({ keyEvents: { ...KE, total: 0, previousTotal: 0, organic: 0, previousOrganic: 0, organicByEvent: [] } }), READY);
    expect(html).toContain(k.allZero);
    expect(html).toContain(k.noPrevious);
    // The figures' own note speaks of key events, not of visits, and there is no table to explain.
    expect(html).toContain(k.noPreviousValue);
    expect(html).not.toContain(t.metrics.noPrevious);
    expect(html).not.toContain(k.limits);
    expect(html).toContain(`>${k.organic.label}</dt>`);
    expect(html).not.toContain(k.table.caption);
  });

  it("warns about a missing organic count and more configured events (AC-003, AC-008)", () => {
    const { html } = render(completed({ keyEvents: { ...KE, organic: 0, previousOrganic: 0, organicByEvent: [], configuredMore: true } }), READY);
    expect(html).toContain(k.organicMissing);
    expect(html).toContain(k.configuredMore);
  });

  it("keeps the block and the quality notice in the no-visits state (AC-003, AC-006)", () => {
    const { html } = render(
      completed({ totals: zero, previousTotals: zero, channels: [], pages: [], quality: { otherRow: false, thresholded: true, sampled: false }, keyEvents: KE }),
      READY,
    );
    expect(html).toContain(t.reasons.empty);
    expect(html).toContain(k.title);
    expect(html).toContain("ocultó algunas filas");
  });

  it("asks to update a capture taken before feature 008, or to set up when there is no button (AC-006)", () => {
    expect(render(completed({ keyEvents: null }), READY).html).toContain(k.missing(t.button.update));
    const invalid = render(completed({ keyEvents: null }), INVALID).html;
    expect(invalid).toContain(k.missingNotConfigured);
    expect(invalid).not.toContain(k.title);
  });

  it("paints hostile event and configured names as text: no script element and no link (AC-010)", () => {
    const hostile = '<script>alert(1)</script><a href="https://x.example">x</a>';
    const { html } = render(completed({ channels: [{ channel: hostile, sessions: 5, previousSessions: 1 }], keyEvents: { ...KE, configured: [hostile], organicByEvent: [{ event: hostile, keyEvents: 3 }] } }), READY);
    expect(html.split("&lt;script&gt;alert(1)&lt;/script&gt;").length).toBe(4);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('<a href="https://x.example"');
  });

  it("renders in English", () => {
    const en = getMessages("en").analytics.keyEvents;
    const { html } = render(completed({ keyEvents: KE }), READY, "en");
    expect(html).toContain(en.title);
    expect(html).toContain(en.share("25.0%"));
  });
});
