import {
  BingError,
  getPageStats,
  getQueryStats,
  getRankAndTrafficStats,
  getUserSites,
  type BingErrorKind,
  type ClientOptions,
  type DailyTraffic,
  type Site,
  type StatsRow,
} from "@/modules/bing-webmaster/bing";

/**
 * One Bing Webmaster capture: sites, daily traffic, top queries and top pages, in series.
 * At most 4 requests (NFR).
 */

export interface Totals {
  clicks: number;
  impressions: number;
  /** 0–1; 0 when there were no impressions. */
  ctr: number;
}

interface RowMetrics extends Totals {
  /** Impression-weighted average position; null when Bing gave none. */
  position: number | null;
}

export interface QueryRow extends RowMetrics {
  query: string;
}

export interface PageRow extends RowMetrics {
  page: string;
}

/** Inclusive YYYY-MM-DD days, as Bing dates them. */
export interface Period {
  start: string;
  end: string;
}

/** Periods and totals are null while Bing has no traffic for the site (just verified, AC-005). */
export interface CollectedData {
  siteUrl: string;
  current: Period | null;
  previous: Period | null;
  totals: Totals | null;
  previousTotals: Totals | null;
  queries: QueryRow[];
  pages: PageRow[];
  /** Days covered by the query and page rows; Bing gives them without a date range (D005). */
  rows: Period | null;
}

export type CollectFailure = {
  ok: false;
  kind: BingErrorKind;
  message: string;
  siteUrl: string | null;
  /** How many verified sites the key sees; set when none matched this company. */
  verifiedSites: number | null;
};

export type CollectOutcome = { ok: true; data: CollectedData } | CollectFailure;

export const PERIOD_DAYS = 28;
export const TOP_QUERIES = 25;
export const TOP_PAGES = 10;

const DAY_MS = 86_400_000;
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const ctrOf = (clicks: number, impressions: number) => (impressions > 0 ? clicks / impressions : 0);
const normalize = (url: string) => url.toLowerCase().replace(/\/+$/, "");

/**
 * Bing site for a company, by fixed priority (D003): https before http; stored host, bare domain,
 * then www. A verified match wins over an unverified one, which is still returned so the caller
 * can say "verify it in Bing".
 */
export function pickSite(sites: Site[], site: { domain: string; hostname: string }): Site | null {
  const hosts = [...new Set([site.hostname, site.domain, `www.${site.domain}`])];
  const candidates = ["https", "http"].flatMap((scheme) => hosts.map((h) => normalize(`${scheme}://${h}`)));
  const find = (pool: Site[]) => {
    for (const candidate of candidates) {
      const match = pool.find((s) => normalize(s.url) === candidate);
      if (match) return match;
    }
    return null;
  };
  return find(sites.filter((s) => s.isVerified)) ?? find(sites);
}

const latestDay = (days: DailyTraffic[]) => days.reduce((last, d) => (d.day > last ? d.day : last), days[0]!.day);

/**
 * 28 days ending on the last day with clicks or impressions, and the 28 before; missing days count
 * as zero (D004). Trailing all-zero days (not processed yet) do not move the period; if every day
 * is zero, the last reported day is used.
 */
export function trafficPeriods(days: DailyTraffic[]): { current: Period; previous: Period; totals: Totals; previousTotals: Totals } | null {
  if (days.length === 0) return null;
  const withData = days.filter((d) => d.clicks > 0 || d.impressions > 0);
  const end = latestDay(withData.length > 0 ? withData : days);
  const current = { start: shiftDay(end, -(PERIOD_DAYS - 1)), end };
  const previous = { start: shiftDay(end, -(2 * PERIOD_DAYS - 1)), end: shiftDay(end, -PERIOD_DAYS) };
  const sum = (p: Period): Totals => {
    const inside = days.filter((d) => d.day >= p.start && d.day <= p.end);
    const clicks = inside.reduce((n, d) => n + d.clicks, 0);
    const impressions = inside.reduce((n, d) => n + d.impressions, 0);
    return { clicks, impressions, ctr: ctrOf(clicks, impressions) };
  };
  return { current, previous, totals: sum(current), previousTotals: sum(previous) };
}

/**
 * Groups rows by query or page (Bing may repeat a key across weeks, D005), sums clicks and
 * impressions, weights position by impressions, and keeps the top `limit` by clicks.
 */
export function aggregate(rows: StatsRow[], limit: number): { rows: (RowMetrics & { key: string })[]; window: Period | null } {
  const groups = new Map<string, { clicks: number; impressions: number; weighted: number; weight: number }>();
  for (const row of rows) {
    const group = groups.get(row.key) ?? { clicks: 0, impressions: 0, weighted: 0, weight: 0 };
    group.clicks += row.clicks;
    group.impressions += row.impressions;
    if (row.position !== null && row.impressions > 0) {
      group.weighted += row.position * row.impressions;
      group.weight += row.impressions;
    }
    groups.set(row.key, group);
  }
  const sorted = [...groups]
    .map(([key, g]) => ({ key, clicks: g.clicks, impressions: g.impressions, ctr: ctrOf(g.clicks, g.impressions), position: g.weight > 0 ? g.weighted / g.weight : null }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.key.localeCompare(b.key))
    .slice(0, limit);
  const days = rows.map((r) => r.day).sort();
  return { rows: sorted, window: days.length > 0 ? { start: days[0]!, end: days[days.length - 1]! } : null };
}

function spanOf(a: Period | null, b: Period | null): Period | null {
  if (!a || !b) return a ?? b;
  return { start: a.start < b.start ? a.start : b.start, end: a.end > b.end ? a.end : b.end };
}

export async function collectBingWebmaster(apiKey: string, site: { domain: string; hostname: string }, options: ClientOptions = {}): Promise<CollectOutcome> {
  let siteUrl: string | null = null;
  try {
    const sites = await getUserSites(apiKey, options);
    const picked = pickSite(sites, site);
    if (!picked) {
      return {
        ok: false,
        kind: "no_access",
        message: `La clave no tiene ningún sitio de ${site.domain} en Bing Webmaster Tools`,
        siteUrl: null,
        verifiedSites: sites.filter((s) => s.isVerified).length,
      };
    }
    siteUrl = picked.url;
    if (!picked.isVerified) {
      return { ok: false, kind: "not_verified", message: "El sitio está en Bing Webmaster Tools pero sin verificar", siteUrl, verifiedSites: null };
    }
    const traffic = trafficPeriods(await getRankAndTrafficStats(apiKey, siteUrl, options));
    const queries = aggregate(await getQueryStats(apiKey, siteUrl, options), TOP_QUERIES);
    const pages = aggregate(await getPageStats(apiKey, siteUrl, options), TOP_PAGES);
    return {
      ok: true,
      data: {
        siteUrl,
        current: traffic?.current ?? null,
        previous: traffic?.previous ?? null,
        totals: traffic?.totals ?? null,
        previousTotals: traffic?.previousTotals ?? null,
        queries: queries.rows.map(({ key, ...metrics }) => ({ query: key, ...metrics })),
        pages: pages.rows.map(({ key, ...metrics }) => ({ page: key, ...metrics })),
        rows: spanOf(queries.window, pages.window),
      },
    };
  } catch (error) {
    if (error instanceof BingError) return { ok: false, kind: error.kind, message: error.message, siteUrl, verifiedSites: null };
    return { ok: false, kind: "error", message: "Error inesperado al leer Bing Webmaster", siteUrl, verifiedSites: null };
  }
}
