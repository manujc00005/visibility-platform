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
