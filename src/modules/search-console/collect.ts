import type { ServiceAccount } from "@/modules/search-console/credentials";
import {
  fetchAccessToken,
  GscError,
  listSites,
  querySearchAnalytics,
  type AnalyticsRow,
  type ClientOptions,
  type GscErrorKind,
  type SiteEntry,
} from "@/modules/search-console/google";

/**
 * One Search Console capture: token, property, then four Search Analytics queries
 * (totals now and before, top queries, top pages). At most 6 requests (NFR).
 */

export interface Totals {
  clicks: number;
  impressions: number;
  /** 0–1. */
  ctr: number;
  /** Impression-weighted average position; 0 when there were no impressions. */
  position: number;
}

export interface QueryRow extends Totals {
  query: string;
}

export interface PageRow extends Totals {
  page: string;
}

/** Inclusive YYYY-MM-DD dates, Pacific time as Search Console defines them. */
export interface Period {
  start: string;
  end: string;
}

export interface CollectedData {
  property: string;
  current: Period;
  previous: Period;
  totals: Totals;
  previousTotals: Totals;
  queries: QueryRow[];
  pages: PageRow[];
}

export type CollectFailure = {
  ok: false;
  kind: GscErrorKind;
  message: string;
  property: string | null;
  /** How many properties the service account can read; set when none matched this company. */
  accessibleProperties: number | null;
};

export type CollectOutcome = { ok: true; data: CollectedData } | CollectFailure;

export const PERIOD_DAYS = 28;
/** Final data takes a few days; ending 3 days back keeps the period stable (D005). */
export const LAG_DAYS = 3;
export const TOP_QUERIES = 25;
export const TOP_PAGES = 10;
const MAX_QUERY_LENGTH = 200;
const MAX_PAGE_LENGTH = 500;

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function periodsFor(now: Date): { current: Period; previous: Period } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = today - LAG_DAYS * DAY_MS;
  const start = end - (PERIOD_DAYS - 1) * DAY_MS;
  const previousEnd = start - DAY_MS;
  const previousStart = previousEnd - (PERIOD_DAYS - 1) * DAY_MS;
  return { current: { start: isoDay(start), end: isoDay(end) }, previous: { start: isoDay(previousStart), end: isoDay(previousEnd) } };
}

const READABLE: ReadonlySet<string> = new Set(["siteOwner", "siteFullUser", "siteRestrictedUser"]);

/**
 * Property for a company, by fixed priority (D003): the domain property covers every
 * protocol and subdomain, then URL-prefix properties for the stored host, the bare
 * domain and www, https before http.
 */
export function pickProperty(sites: SiteEntry[], site: { domain: string; hostname: string }): string | null {
  const readable = new Set(sites.filter((s) => READABLE.has(s.permissionLevel)).map((s) => s.siteUrl));
  const hosts = [...new Set([site.hostname, site.domain, `www.${site.domain}`])];
  const candidates = [`sc-domain:${site.domain}`, ...["https", "http"].flatMap((scheme) => hosts.map((h) => `${scheme}://${h}/`))];
  return candidates.find((c) => readable.has(c)) ?? null;
}

const ZERO: Totals = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
const totalsOf = (r: AnalyticsRow): Totals => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });

export async function collectSearchConsole(
  account: ServiceAccount,
  site: { domain: string; hostname: string },
  options: ClientOptions & { now?: Date } = {},
): Promise<CollectOutcome> {
  const now = options.now ?? new Date();
  let property: string | null = null;
  try {
    const token = await fetchAccessToken(account, { ...options, nowSeconds: Math.floor(now.getTime() / 1000) });
    const sites = await listSites(token, options);
    property = pickProperty(sites, site);
    if (!property) {
      return {
        ok: false,
        kind: "no_access",
        message: `La cuenta de servicio no tiene acceso a ninguna propiedad de ${site.domain} en Search Console`,
        property: null,
        accessibleProperties: sites.filter((s) => READABLE.has(s.permissionLevel)).length,
      };
    }
    const { current, previous } = periodsFor(now);
    const range = (p: Period) => ({ startDate: p.start, endDate: p.end });
    const siteUrl = property;
    const [totals, previousTotals, queries, pages] = await Promise.all([
      querySearchAnalytics(token, siteUrl, { ...range(current), dimensions: [], rowLimit: 1 }, options),
      querySearchAnalytics(token, siteUrl, { ...range(previous), dimensions: [], rowLimit: 1 }, options),
      querySearchAnalytics(token, siteUrl, { ...range(current), dimensions: ["query"], rowLimit: TOP_QUERIES }, options),
      querySearchAnalytics(token, siteUrl, { ...range(current), dimensions: ["page"], rowLimit: TOP_PAGES }, options),
    ]);
    return {
      ok: true,
      data: {
        property,
        current,
        previous,
        totals: totals[0] ? totalsOf(totals[0]) : ZERO,
        previousTotals: previousTotals[0] ? totalsOf(previousTotals[0]) : ZERO,
        queries: queries.slice(0, TOP_QUERIES).map((r) => ({ query: (r.keys[0] ?? "").slice(0, MAX_QUERY_LENGTH), ...totalsOf(r) })),
        pages: pages.slice(0, TOP_PAGES).map((r) => ({ page: (r.keys[0] ?? "").slice(0, MAX_PAGE_LENGTH), ...totalsOf(r) })),
      },
    };
  } catch (error) {
    if (error instanceof GscError) return { ok: false, kind: error.kind, message: error.message, property, accessibleProperties: null };
    return { ok: false, kind: "error", message: "Error inesperado al leer Search Console", property, accessibleProperties: null };
  }
}
