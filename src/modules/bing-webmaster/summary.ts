import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { PageRow, Period, QueryRow, Totals } from "@/modules/bing-webmaster/collect";
import type { BingWebmasterConfig } from "@/modules/bing-webmaster/deps";
import type { LatestBingWebmaster } from "@/modules/bing-webmaster/service";
import { countChange, ctrChange, formatters, type MetricView } from "@/modules/search-console/summary";

/**
 * What the SEO page shows about Bing Webmaster Tools. Pure: it reads stored captures and the
 * configuration state, never Bing. Changes are worded with Search Console's shared phrases so
 * both sections keep the same Spanish format (D008). Failures are explained from their kind;
 * the stored message stays as a diagnostic.
 */

export type BingWebmasterState = "not_configured" | "invalid_config" | "no_data" | "processing" | "error" | "ok";

export interface BingWebmasterSummary {
  state: BingWebmasterState;
  /** Owner-readable explanation for every state but "ok". */
  reason: string | null;
  siteUrl: string | null;
  period: Period | null;
  previousPeriod: Period | null;
  /** Days the query and page rows cover (D005). */
  rows: Period | null;
  capturedAt: Date | null;
  /** Null while Bing has no traffic for the site. */
  metrics: { clicks: MetricView; impressions: MetricView; ctr: MetricView } | null;
  queries: QueryRow[];
  pages: PageRow[];
  /** Set when the newest attempt failed after (or without) a good capture. */
  lastFailure: { text: string; at: Date } | null;
  /** Stored data stays visible when the key is later removed or broken; this says so (D009). */
  configWarning: string | null;
}

type Texts = Messages["bingWebmaster"];
type ChangeTexts = Messages["searchConsole"];

function metricsOf(totals: Totals, previous: Totals, t: ChangeTexts, locale: Locale): NonNullable<BingWebmasterSummary["metrics"]> {
  const f = formatters(locale, t);
  // FR-010: without impressions before, there is nothing to compare against.
  const comparable = previous.impressions > 0;
  const hasImpressions = totals.impressions > 0;
  return {
    clicks: {
      value: f.integer(totals.clicks),
      previous: comparable ? f.integer(previous.clicks) : null,
      change: comparable ? countChange(totals.clicks, previous.clicks, t.units.clicks, t, f) : null,
    },
    impressions: {
      value: f.integer(totals.impressions),
      previous: comparable ? f.integer(previous.impressions) : null,
      change: comparable ? countChange(totals.impressions, previous.impressions, t.units.impressions, t, f) : null,
    },
    ctr: {
      value: hasImpressions ? f.percent(totals.ctr) : "—",
      previous: comparable ? f.percent(previous.ctr) : null,
      change: comparable && hasImpressions ? ctrChange(totals.ctr, previous.ctr, t, f) : null,
    },
  };
}

function failureText(s: NonNullable<LatestBingWebmaster["latest"]>, domain: string, t: Texts): string {
  switch (s.errorKind) {
    case "no_access": {
      const text = t.failures.no_access(domain);
      return s.verifiedSites === null ? text : `${text} ${t.failures.verifiedSites(s.verifiedSites)}`;
    }
    case "not_verified":
      return t.failures.not_verified(s.siteUrl ?? domain);
    case "invalid_credentials":
    case "quota_exceeded":
      return t.failures[s.errorKind];
    default:
      return t.failures.error;
  }
}

export function summarizeBingWebmaster(
  stored: LatestBingWebmaster,
  config: BingWebmasterConfig,
  domain: string,
  locale: Locale = DEFAULT_LOCALE,
): BingWebmasterSummary {
  const messages = getMessages(locale);
  const t = messages.bingWebmaster;
  const { latest, latestCompleted } = stored;
  const base: BingWebmasterSummary = {
    state: "no_data",
    reason: null,
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
  };
  const configReason =
    config.state === "not_configured" ? t.reasons.notConfigured : config.state === "invalid" ? t.reasons.invalidConfig[config.reason] : null;
  const failed = latest && latest.status === "failed" ? { text: failureText(latest, domain, t), at: latest.createdAt } : null;

  if (latestCompleted) {
    const c = latestCompleted;
    const hasTraffic = c.totals && c.previousTotals && c.currentStart && c.currentEnd;
    const captured = {
      ...base,
      siteUrl: c.siteUrl,
      capturedAt: c.createdAt,
      rows: c.rowsStart && c.rowsEnd ? { start: c.rowsStart, end: c.rowsEnd } : null,
      queries: c.queries,
      pages: c.pages,
      lastFailure: failed,
      configWarning: configReason ? `${configReason} ${t.reasons.storedData}` : null,
    };
    if (hasTraffic) {
      return {
        ...captured,
        state: "ok",
        period: { start: c.currentStart!, end: c.currentEnd! },
        previousPeriod: c.previousStart && c.previousEnd ? { start: c.previousStart, end: c.previousEnd } : null,
        metrics: metricsOf(c.totals!, c.previousTotals!, messages.searchConsole, locale),
      };
    }
    // Bing answered but has nothing yet: a just-verified site takes up to 48 h (AC-005).
    if (c.queries.length === 0 && c.pages.length === 0) return { ...captured, state: "processing", reason: t.reasons.processing };
    // Searches or pages without daily traffic: each block explains its own gap.
    return { ...captured, state: "ok", reason: t.reasons.noTraffic };
  }

  if (config.state === "not_configured") return { ...base, state: "not_configured", reason: t.reasons.notConfigured, lastFailure: failed };
  if (config.state === "invalid") return { ...base, state: "invalid_config", reason: t.reasons.invalidConfig[config.reason], lastFailure: failed };
  if (failed) return { ...base, state: "error", reason: failed.text, lastFailure: failed };
  return { ...base, reason: t.reasons.noData(t.button.fetch) };
}
