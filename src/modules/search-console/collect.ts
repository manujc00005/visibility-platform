import { BrandTermsError, brandTerms } from "@/modules/search-console/brand-terms";
import type { ServiceAccount } from "@/modules/search-console/credentials";
import {
  fetchAccessToken,
  GscError,
  listSites,
  querySearchAnalytics,
  type AnalyticsQuery,
  type AnalyticsRow,
  type ClientOptions,
  type GscErrorKind,
  type SiteEntry,
} from "@/modules/search-console/google";

/**
 * One Search Console capture: token, property, then eight Search Analytics queries started
 * together: totals now and before, top queries, top pages, and totals with and without the
 * brand in both periods (feature 007). At most 10 requests.
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

/**
 * Totals of queries that contain a brand term and of those that do not (feature 007). Each
 * `Totals` is Google's answer to its own filtered query; they do not add up to `totals`
 * because Google leaves some queries out when filtering by query (D003).
 */
export interface Segments {
  version: 1;
  /** Terms actually sent, as typed, in order: name, aliases, domain. */
  terms: string[];
  termsTruncated: boolean;
  branded: Totals;
  nonBranded: Totals;
  previousBranded: Totals;
  previousNonBranded: Totals;
}

export interface CollectedData {
  property: string;
  current: Period;
  previous: Period;
  totals: Totals;
  previousTotals: Totals;
  queries: QueryRow[];
  pages: PageRow[];
  segments: Segments;
}

/** What a capture needs from the company, read once when the attempt starts. */
export interface CaptureSite {
  domain: string;
  hostname: string;
  name: string;
  brandAliases: string[];
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

export async function collectSearchConsole(account: ServiceAccount, site: CaptureSite, options: ClientOptions & { now?: Date } = {}): Promise<CollectOutcome> {
  const now = options.now ?? new Date();
  let property: string | null = null;
  try {
    // Built before any request: an expression that cannot fit fails without touching Google.
    const brand = brandTerms(site);
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
    const filtered = (p: Period, operator: "includingRegex" | "excludingRegex"): AnalyticsQuery => ({
      ...range(p),
      dimensions: [],
      rowLimit: 1,
      dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "query", operator, expression: brand.expression }] }],
    });
    const [totals, previousTotals, queries, pages, branded, nonBranded, previousBranded, previousNonBranded] = await Promise.all([
      querySearchAnalytics(token, siteUrl, { ...range(current), dimensions: [], rowLimit: 1 }, options),
      querySearchAnalytics(token, siteUrl, { ...range(previous), dimensions: [], rowLimit: 1 }, options),
      querySearchAnalytics(token, siteUrl, { ...range(current), dimensions: ["query"], rowLimit: TOP_QUERIES }, options),
      querySearchAnalytics(token, siteUrl, { ...range(current), dimensions: ["page"], rowLimit: TOP_PAGES }, options),
      querySearchAnalytics(token, siteUrl, filtered(current, "includingRegex"), options),
      querySearchAnalytics(token, siteUrl, filtered(current, "excludingRegex"), options),
      querySearchAnalytics(token, siteUrl, filtered(previous, "includingRegex"), options),
      querySearchAnalytics(token, siteUrl, filtered(previous, "excludingRegex"), options),
    ]);
    const first = (rows: AnalyticsRow[]) => (rows[0] ? totalsOf(rows[0]) : ZERO);
    return {
      ok: true,
      data: {
        property,
        current,
        previous,
        totals: first(totals),
        previousTotals: first(previousTotals),
        queries: queries.slice(0, TOP_QUERIES).map((r) => ({ query: (r.keys[0] ?? "").slice(0, MAX_QUERY_LENGTH), ...totalsOf(r) })),
        pages: pages.slice(0, TOP_PAGES).map((r) => ({ page: (r.keys[0] ?? "").slice(0, MAX_PAGE_LENGTH), ...totalsOf(r) })),
        segments: {
          version: 1,
          terms: brand.terms,
          termsTruncated: brand.truncated,
          branded: first(branded),
          nonBranded: first(nonBranded),
          previousBranded: first(previousBranded),
          previousNonBranded: first(previousNonBranded),
        },
      },
    };
  } catch (error) {
    if (error instanceof BrandTermsError) return { ok: false, kind: "error", message: error.message, property, accessibleProperties: null };
    if (error instanceof GscError) return { ok: false, kind: error.kind, message: error.message, property, accessibleProperties: null };
    return { ok: false, kind: "error", message: "Error inesperado al leer Search Console", property, accessibleProperties: null };
  }
}
