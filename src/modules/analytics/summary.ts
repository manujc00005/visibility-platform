import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { KeyEvents, Period, Totals } from "@/modules/analytics/collect";
import type { AnalyticsConfig } from "@/modules/analytics/deps";
import type { Quality } from "@/modules/analytics/ga4";
import { MAX_PROPERTIES } from "@/modules/analytics/collect";
import type { LatestAnalytics } from "@/modules/analytics/service";
import type { Change } from "@/modules/overview/types";
import { countChange, formatters, type MetricView } from "@/modules/search-console/summary";

/**
 * What the SEO page shows about Google Analytics 4. Pure: it reads stored captures and the
 * configuration state, never Google. Changes use Search Console's shared phrases (D008 of 005).
 * Failures are explained from their kind; the stored message stays as a diagnostic.
 */

export type AnalyticsState = "not_configured" | "invalid_config" | "no_data" | "empty" | "error" | "ok";

export interface ChannelView {
  channel: string;
  sessions: string;
  change: Change | null;
}

export interface PageView {
  page: string;
  views: string;
  users: string;
}

/** The key event block (feature 008). */
export interface KeyEventsView {
  /** `none_configured`: the property has no key events now; the block shows no figures. */
  state: "none_configured" | "ok";
  organic: MetricView;
  total: MetricView;
  /** Organic share of the total, or "—" when the total is zero. */
  organicShare: string;
  /** The current total is above zero, so the share sentence makes sense. */
  hasTotal: boolean;
  byEvent: { event: string; keyEvents: string }[];
  configured: string[];
  configuredMore: boolean;
  /** Both periods add up to zero. */
  allZero: boolean;
  /** Key events are configured and the previous period is zero: marking may be recent. */
  noPrevious: boolean;
  /** Key events exist but none came under the exact `Organic Search` channel (D003). */
  organicMissing: boolean;
}

export interface AnalyticsSummary {
  state: AnalyticsState;
  /** Owner-readable explanation for every state but "ok". */
  reason: string | null;
  property: string | null;
  propertyName: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  capturedAt: Date | null;
  metrics: { users: MetricView; sessions: MetricView; views: MetricView } | null;
  channels: ChannelView[];
  pages: PageView[];
  /** One sentence when GA4 grouped, hid or sampled data (FR-011). */
  quality: string | null;
  /** Set when the newest attempt failed after (or without) a good capture. */
  lastFailure: { text: string; at: Date } | null;
  /** Stored data stays visible when the credential is later removed or broken (D007). */
  configWarning: string | null;
  /** Key events of the latest good capture; null without one or when it predates feature 008. */
  keyEvents: KeyEventsView | null;
}

type Texts = Messages["analytics"];
type Snapshot = NonNullable<LatestAnalytics["latest"]>;

function failureText(s: Snapshot, config: AnalyticsConfig, domain: string, t: Texts): string {
  const email = config.state === "ready" ? config.clientEmail : t.failures.thisAccount;
  switch (s.errorKind) {
    case "no_access": {
      // Without a count the property was found but Google refused it (403).
      if (s.accessibleProperties === null) return t.failures.denied;
      const parts = [t.failures.no_access(email, domain), t.failures.visibleProperties(s.accessibleProperties)];
      if (s.propertiesSkipped) parts.push(t.failures.skipped(MAX_PROPERTIES));
      return parts.join(" ");
    }
    case "admin_api_disabled":
    case "data_api_disabled":
    case "invalid_credentials":
    case "quota_exceeded":
      return t.failures[s.errorKind];
    default:
      return t.failures.error;
  }
}

function qualityText(q: Quality | null, t: Texts): string | null {
  if (!q) return null;
  const items = [q.otherRow && t.quality.otherRow, q.thresholded && t.quality.thresholded, q.sampled && t.quality.sampled].filter((x): x is string => Boolean(x));
  return items.length > 0 ? t.quality.intro(items.join(t.quality.separator)) : null;
}

function keyEventsOf(k: KeyEvents, t: Texts, shared: Messages["searchConsole"], f: ReturnType<typeof formatters>): KeyEventsView {
  // keyEvents is TYPE_FLOAT in GA4 (D009 of 008): whole numbers as such, fractions with one decimal.
  const count = (n: number) => (Number.isInteger(n) ? f.integer(n) : f.decimal(n));
  // Each figure compares only against its own previous value (FR-008 of 008).
  const metric = (current: number, previous: number): MetricView => ({
    value: count(current),
    previous: previous > 0 ? count(previous) : null,
    change: previous > 0 ? countChange(current, previous, t.keyEvents.unit, shared, f) : null,
  });
  const configured = k.configured.length > 0;
  return {
    state: configured ? "ok" : "none_configured",
    organic: metric(k.organic, k.previousOrganic),
    total: metric(k.total, k.previousTotal),
    organicShare: k.total > 0 ? f.percent(k.organic / k.total) : "—",
    hasTotal: k.total > 0,
    byEvent: k.organicByEvent.map((e) => ({ event: e.event, keyEvents: count(e.keyEvents) })),
    configured: k.configured,
    configuredMore: k.configuredMore,
    allZero: k.total === 0 && k.previousTotal === 0,
    noPrevious: configured && k.previousTotal === 0,
    organicMissing: k.total > 0 && k.organic === 0,
  };
}

const isZero = (x: Totals) => x.users === 0 && x.sessions === 0 && x.views === 0;

export function summarizeAnalytics(stored: LatestAnalytics, config: AnalyticsConfig, domain: string, locale: Locale = DEFAULT_LOCALE): AnalyticsSummary {
  const messages = getMessages(locale);
  const t = messages.analytics;
  const shared = messages.searchConsole;
  const f = formatters(locale, shared);
  const { latest, latestCompleted } = stored;
  const base: AnalyticsSummary = {
    state: "no_data",
    reason: null,
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
  };
  // Same variable as Search Console (D002), so the same explanation.
  const configReason =
    config.state === "not_configured" ? t.reasons.notConfigured : config.state === "invalid" ? shared.reasons.invalidConfig[config.reason] : null;
  const failed = latest && latest.status === "failed" ? { text: failureText(latest, config, domain, t), at: latest.createdAt } : null;

  const c = latestCompleted;
  if (c?.totals && c.previousTotals && c.currentStart && c.currentEnd && c.previousStart && c.previousEnd) {
    const captured = {
      ...base,
      property: c.property,
      propertyName: c.propertyName || null,
      period: { start: c.currentStart, end: c.currentEnd },
      previousPeriod: { start: c.previousStart, end: c.previousEnd },
      capturedAt: c.createdAt,
      lastFailure: failed,
      configWarning: configReason ? `${configReason} ${t.reasons.storedData}` : null,
      // Shown in the no-visits state too, with the quality notice of its reports (D006 of 008).
      keyEvents: c.keyEvents ? keyEventsOf(c.keyEvents, t, shared, f) : null,
      quality: qualityText(c.quality, t),
    };
    if (isZero(c.totals) && isZero(c.previousTotals)) return { ...captured, state: "empty", reason: t.reasons.empty };

    // FR-014: without sessions before, there is nothing to compare against.
    const comparable = c.previousTotals.sessions > 0;
    const metric = (key: keyof Totals): MetricView => ({
      value: f.integer(c.totals![key]),
      previous: comparable ? f.integer(c.previousTotals![key]) : null,
      change: comparable ? countChange(c.totals![key], c.previousTotals![key], t.units[key], shared, f) : null,
    });
    return {
      ...captured,
      state: "ok",
      metrics: { users: metric("users"), sessions: metric("sessions"), views: metric("views") },
      channels: c.channels.map((row) => ({
        channel: row.channel,
        sessions: f.integer(row.sessions),
        change: comparable ? countChange(row.sessions, row.previousSessions, t.units.sessions, shared, f) : null,
      })),
      pages: c.pages.map((row) => ({ page: row.page, views: f.integer(row.views), users: f.integer(row.users) })),
    };
  }

  if (config.state === "not_configured") return { ...base, state: "not_configured", reason: t.reasons.notConfigured, lastFailure: failed };
  if (config.state === "invalid") return { ...base, state: "invalid_config", reason: shared.reasons.invalidConfig[config.reason], lastFailure: failed };
  if (failed) return { ...base, state: "error", reason: failed.text, lastFailure: failed };
  return { ...base, reason: t.reasons.noData(t.button.fetch) };
}
