import { formatDate, formatNumber } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { Change } from "@/modules/overview/types";
import { brandMatcher } from "@/modules/search-console/brand-terms";
import type { PageRow, Period, QueryRow, Segments, Totals } from "@/modules/search-console/collect";
import type { SearchConsoleConfig } from "@/modules/search-console/deps";
import type { LatestSearchConsole } from "@/modules/search-console/service";

/**
 * What the Google tab and the overview card show about Search Console. Pure: it reads stored
 * captures and the configuration state, never Google. Texts follow `locale`, Spanish by
 * default (i18n D007). Failures are explained from their kind, not from the stored message,
 * which stays as a diagnostic.
 */

export type SearchConsoleState = "not_configured" | "invalid_config" | "no_data" | "error" | "ok";

export interface MetricView {
  value: string;
  previous: string | null;
  change: Change | null;
}

/** One brand block of the capture (feature 007): formatted figures, share of the total and change. */
export interface SegmentBlockView {
  clicks: string;
  impressions: string;
  /** Share of the period's total clicks, or "—" when there were none. */
  clicksShare: string;
  impressionsShare: string;
  /** Clicks against the previous period; null when this block had no impressions before. */
  change: Change | null;
}

export interface SegmentsView {
  /** No impressions in the current period: show the empty phrase, no shares. */
  empty: boolean;
  branded: SegmentBlockView;
  nonBranded: SegmentBlockView;
  /** What Google did not classify, never below zero (D003). */
  hidden: { clicks: string; impressions: string };
  previousHidden: { clicks: string; impressions: string };
  /** Branded plus non-branded exceeded the total in some period and metric. */
  mismatch: boolean;
  terms: string[];
  truncated: boolean;
}

/**
 * A stored query row. `branded` is only present when the capture has segments (007, FR-007).
 * `positionChange` is null only for captures taken before feature 009.
 */
export type QueryView = QueryRow & { branded?: boolean; positionChange: Change | null };

export interface SearchConsoleSummary {
  state: SearchConsoleState;
  /** Owner-readable explanation for every state but "ok". */
  reason: string | null;
  property: string | null;
  period: Period | null;
  capturedAt: Date | null;
  metrics: { clicks: MetricView; impressions: MetricView; ctr: MetricView; position: MetricView } | null;
  queries: QueryView[];
  pages: PageRow[];
  /** Brand split of the latest good capture; null without one or when it predates feature 007. */
  segments: SegmentsView | null;
  /** Set when the newest attempt failed after (or without) a good capture. */
  lastFailure: { text: string; at: Date } | null;
  /** One line for the overview card, or null when there is nothing measured. */
  cardLine: string | null;
}

type Texts = Messages["searchConsole"];

/** Below this relative change, a difference is noise for a 28-day window. */
const SAME_THRESHOLD = 0.05;
const POSITION_SAME = 0.5;

export function formatters(locale: Locale, t: Texts) {
  const integer = (n: number) => formatNumber(Math.round(n), locale, { maximumFractionDigits: 0 });
  const decimal = (n: number) => formatNumber(n, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const percent = (ratio: number) => t.percent(decimal(ratio * 100));
  const signed = (n: number, text: string) => `${n > 0 ? "+" : "−"}${text}`;
  return { integer, decimal, percent, signed };
}
type Format = ReturnType<typeof formatters>;

export function countChange(current: number, previous: number, unit: (count: number) => string, t: Texts, f: Format): Change {
  const before = `${f.integer(previous)} ${unit(Math.round(previous))}`;
  if (previous === 0) return current === 0 ? { direction: "same", text: t.changes.sameAsBefore } : { direction: "better", text: t.changes.before(before) };
  const ratio = (current - previous) / previous;
  if (Math.abs(ratio) < SAME_THRESHOLD) return { direction: "same", text: t.changes.same(before) };
  const pct = Math.round(ratio * 100);
  return { direction: ratio > 0 ? "better" : "worse", text: t.changes.changed(before, t.changes.signedPercent(pct, f.integer(Math.abs(pct)))) };
}

/** Lower is better: moving from 12 to 8 is going up four places. */
function positionChange(current: number, previous: number, t: Texts, f: Format): Change {
  const delta = current - previous;
  const before = f.decimal(previous);
  if (Math.abs(delta) < POSITION_SAME) return { direction: "same", text: t.changes.same(before) };
  return delta < 0
    ? { direction: "better", text: t.changes.positionUp(before, f.decimal(-delta)) }
    : { direction: "worse", text: t.changes.positionDown(before, f.decimal(delta)) };
}

export function ctrChange(current: number, previous: number, t: Texts, f: Format): Change {
  const delta = (current - previous) * 100;
  const before = f.percent(previous);
  if (Math.abs(delta) < 0.1) return { direction: "same", text: t.changes.same(before) };
  return { direction: delta > 0 ? "better" : "worse", text: t.changes.ctrChanged(before, f.signed(delta, f.decimal(Math.abs(delta)))) };
}

function metricsOf(totals: Totals, previous: Totals, t: Texts, f: Format): NonNullable<SearchConsoleSummary["metrics"]> {
  // FR-008: without impressions before, there is nothing to compare against.
  const comparable = previous.impressions > 0;
  const hasPosition = totals.impressions > 0;
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
      value: hasPosition ? f.percent(totals.ctr) : "—",
      previous: comparable ? f.percent(previous.ctr) : null,
      change: comparable && hasPosition ? ctrChange(totals.ctr, previous.ctr, t, f) : null,
    },
    position: {
      value: hasPosition ? f.decimal(totals.position) : "—",
      previous: comparable ? f.decimal(previous.position) : null,
      change: comparable && hasPosition ? positionChange(totals.position, previous.position, t, f) : null,
    },
  };
}

/** Short text for the table cell (D004 of 009); same threshold as the overall position. */
function queryPositionChange(q: QueryRow, t: Texts, f: Format): Change | null {
  if (q.previous === undefined) return null;
  if (q.previous === null) return { direction: "same", text: t.changes.queryNoPrevious };
  const delta = q.position - q.previous.position;
  if (Math.abs(delta) < POSITION_SAME) return { direction: "same", text: t.changes.querySame };
  return delta < 0 ? { direction: "better", text: t.changes.queryUp(f.decimal(-delta)) } : { direction: "worse", text: t.changes.queryDown(f.decimal(delta)) };
}

function projected(queries: QueryRow[], terms: string[] | null, t: Texts, f: Format): QueryView[] {
  const branded = terms ? brandMatcher(terms) : null;
  return queries.map((q) => ({ ...q, ...(branded ? { branded: branded(q.query) } : {}), positionChange: queryPositionChange(q, t, f) }));
}

function segmentsOf(segments: Segments, totals: Totals, previousTotals: Totals, t: Texts, f: Format): SegmentsView {
  const share = (part: number, whole: number) => (whole > 0 ? f.percent(part / whole) : "—");
  const count = (n: number, unit: (count: number) => string) => `${f.integer(n)} ${unit(Math.round(n))}`;
  const block = (current: Totals, previous: Totals): SegmentBlockView => ({
    clicks: count(current.clicks, t.units.clicks),
    impressions: count(current.impressions, t.units.impressions),
    clicksShare: share(current.clicks, totals.clicks),
    impressionsShare: share(current.impressions, totals.impressions),
    // FR-006: compare only against a block that had impressions before.
    change: previous.impressions > 0 ? countChange(current.clicks, previous.clicks, t.units.clicks, t, f) : null,
  });
  // FR-004: what the two filtered answers leave out of the total, from the raw figures.
  const deltas = [
    [totals.clicks - segments.branded.clicks - segments.nonBranded.clicks, totals.impressions - segments.branded.impressions - segments.nonBranded.impressions],
    [
      previousTotals.clicks - segments.previousBranded.clicks - segments.previousNonBranded.clicks,
      previousTotals.impressions - segments.previousBranded.impressions - segments.previousNonBranded.impressions,
    ],
  ] as const;
  const gap = ([clicks, impressions]: readonly [number, number]) => ({
    clicks: count(Math.max(0, clicks), t.units.clicks),
    impressions: count(Math.max(0, impressions), t.units.impressions),
  });
  return {
    empty: totals.impressions === 0,
    branded: block(segments.branded, segments.previousBranded),
    nonBranded: block(segments.nonBranded, segments.previousNonBranded),
    hidden: gap(deltas[0]),
    previousHidden: gap(deltas[1]),
    mismatch: deltas.some(([clicks, impressions]) => clicks < 0 || impressions < 0),
    terms: segments.terms,
    truncated: segments.termsTruncated,
  };
}

function failureText(s: NonNullable<LatestSearchConsole["latest"]>, config: SearchConsoleConfig, domain: string, t: Texts): string {
  const email = config.state === "ready" ? config.clientEmail : t.failures.thisAccount;
  switch (s.errorKind) {
    case "no_access": {
      const text = t.failures.no_access(email, domain);
      return s.accessibleProperties === null ? text : `${text} ${t.failures.visibleProperties(s.accessibleProperties)}`;
    }
    case "api_disabled":
    case "invalid_credentials":
    case "quota_exceeded":
      return t.failures[s.errorKind];
    default:
      return t.failures.error;
  }
}

export function summarizeSearchConsole(
  stored: LatestSearchConsole,
  config: SearchConsoleConfig,
  domain: string,
  locale: Locale = DEFAULT_LOCALE,
): SearchConsoleSummary {
  const t = getMessages(locale).searchConsole;
  const f = formatters(locale, t);
  const { latest, latestCompleted } = stored;
  const base: SearchConsoleSummary = {
    state: "no_data",
    reason: null,
    property: null,
    period: null,
    capturedAt: null,
    metrics: null,
    queries: [],
    pages: [],
    segments: null,
    lastFailure: null,
    cardLine: null,
  };
  const failed = latest && latest.status === "failed" ? { text: failureText(latest, config, domain, t), at: latest.createdAt } : null;

  if (latestCompleted?.totals && latestCompleted.previousTotals && latestCompleted.currentStart && latestCompleted.currentEnd) {
    const totals = latestCompleted.totals;
    const segments = latestCompleted.segments;
    const clicks = `${f.integer(totals.clicks)} ${t.units.clicks(Math.round(totals.clicks))}`;
    const impressions = `${f.integer(totals.impressions)} ${t.units.impressions(Math.round(totals.impressions))}`;
    return {
      ...base,
      state: "ok",
      property: latestCompleted.property,
      period: { start: latestCompleted.currentStart, end: latestCompleted.currentEnd },
      capturedAt: latestCompleted.createdAt,
      metrics: metricsOf(totals, latestCompleted.previousTotals, t, f),
      queries: projected(latestCompleted.queries, segments?.terms ?? null, t, f),
      pages: latestCompleted.pages,
      segments: segments ? segmentsOf(segments, totals, latestCompleted.previousTotals, t, f) : null,
      lastFailure: failed,
      cardLine: totals.impressions > 0 ? t.card.line(clicks, impressions, f.decimal(totals.position)) : t.card.noImpressions,
    };
  }

  if (config.state === "not_configured") return { ...base, state: "not_configured", reason: t.reasons.notConfigured, lastFailure: failed };
  if (config.state === "invalid") return { ...base, state: "invalid_config", reason: t.reasons.invalidConfig[config.reason], lastFailure: failed };
  if (failed) return { ...base, state: "error", reason: failed.text, lastFailure: failed };
  return { ...base, reason: t.reasons.noData(t.button.fetch) };
}

/** Calendar date for a YYYY-MM-DD string, read in UTC so it never shifts a day. */
export function displayDay(isoDay: string, locale: Locale = DEFAULT_LOCALE): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  return formatDate(new Date(Date.UTC(y!, m! - 1, d!)), locale, { dateStyle: "medium", timeZone: "UTC" });
}
