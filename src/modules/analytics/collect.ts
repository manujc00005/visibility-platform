import type { ServiceAccount } from "@/modules/search-console/credentials";
import { fetchAccessToken, GscError } from "@/modules/search-console/google";
import {
  Ga4Error,
  listKeyEvents,
  listPropertySummaries,
  listWebStreamHosts,
  runReport,
  SCOPE,
  type ClientOptions,
  type DimensionFilter,
  type Ga4ErrorKind,
  type Quality,
} from "@/modules/analytics/ga4";

/**
 * One Google Analytics 4 capture: token, property by domain (Admin API, in series), then six
 * calls in parallel: the three Data API reports of feature 006, the configured key events
 * (Admin API) and two key event reports (feature 008). At most 1 + 1 + 20 + 6 requests.
 */

export interface Totals {
  users: number;
  sessions: number;
  views: number;
}

export interface ChannelRow {
  channel: string;
  sessions: number;
  previousSessions: number;
}

export interface PageRow {
  page: string;
  views: number;
  users: number;
}

/** Inclusive YYYY-MM-DD dates, sent to GA4 as they are (D005). */
export interface Period {
  start: string;
  end: string;
}

/**
 * Key events of the capture (feature 008). `total` and `organic` add up the rows GA4 returned
 * per period in the report by channel, `(other)` included in the total; they are not an
 * independent total. `configured` is the property's configuration when capturing.
 */
export interface KeyEvents {
  version: 1;
  configured: string[];
  configuredMore: boolean;
  total: number;
  previousTotal: number;
  organic: number;
  previousOrganic: number;
  organicByEvent: { event: string; keyEvents: number }[];
}

export interface CollectedData {
  /** `properties/<id>`. */
  property: string;
  propertyName: string;
  current: Period;
  previous: Period;
  totals: Totals;
  previousTotals: Totals;
  channels: ChannelRow[];
  pages: PageRow[];
  quality: Quality;
  keyEvents: KeyEvents;
}

export type CollectFailure = {
  ok: false;
  kind: Ga4ErrorKind;
  message: string;
  property: string | null;
  /** How many properties the service account sees; set when none matched this company. */
  accessibleProperties: number | null;
  /** True when some properties were not checked because of the limit (FR-004). */
  propertiesSkipped: boolean | null;
};

export type CollectOutcome = { ok: true; data: CollectedData } | CollectFailure;

export const PERIOD_DAYS = 28;
/** GA4 usually finishes processing within 48 h (D005). */
export const LAG_DAYS = 2;
export const MAX_PROPERTIES = 20;
export const TOP_CHANNELS = 20;
export const TOP_PAGES = 10;
const MAX_PAGE_LENGTH = 500;
const MAX_CHANNEL_LENGTH = 100;
const MAX_NAME_LENGTH = 200;
/** Exact channel name for organic search (D003 of 008). */
export const ORGANIC = "Organic Search";
export const TOP_EVENTS = 10;
const MAX_EVENT_NAME_LENGTH = 100;
/** Same ceiling as one metric (FR-010 of 006); sums above it are rejected (D007 of 008). */
const MAX_COUNT = 1e12;
const ORGANIC_FILTER: DimensionFilter = { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: ORGANIC, caseSensitive: true } } };

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

const numericId = (property: string) => BigInt(property.slice("properties/".length));

/**
 * Property for a company (D003): a web stream on the stored host, then the bare domain, then www.
 * Ties go to the lowest property id so the choice is stable.
 */
export function pickProperty(candidates: { property: string; hosts: string[] }[], site: { domain: string; hostname: string }): string | null {
  const wanted = [...new Set([site.hostname, site.domain, `www.${site.domain}`])];
  for (const host of wanted) {
    const matches = candidates.filter((c) => c.hosts.includes(host)).map((c) => c.property);
    if (matches.length > 0) return matches.sort((a, b) => (numericId(a) < numericId(b) ? -1 : numericId(a) > numericId(b) ? 1 : 0))[0]!;
  }
  return null;
}

const ZERO: Totals = { users: 0, sessions: 0, views: 0 };

export async function collectAnalytics(
  account: ServiceAccount,
  site: { domain: string; hostname: string },
  options: ClientOptions & { now?: Date } = {},
): Promise<CollectOutcome> {
  const now = options.now ?? new Date();
  let property: string | null = null;
  try {
    const token = await fetchAccessToken(account, { ...options, scope: SCOPE, nowSeconds: Math.floor(now.getTime() / 1000) });
    const { properties, more } = await listPropertySummaries(token, options);
    const checked = properties.slice(0, MAX_PROPERTIES);
    const candidates = [];
    for (const p of checked) candidates.push({ property: p.property, hosts: await listWebStreamHosts(token, p.property, options) });
    property = pickProperty(candidates, site);
    if (!property) {
      return {
        ok: false,
        kind: "no_access",
        message: `La cuenta de servicio no ve ninguna propiedad de Google Analytics con un flujo web de ${site.domain}`,
        property: null,
        accessibleProperties: properties.length,
        propertiesSkipped: more || properties.length > MAX_PROPERTIES,
      };
    }
    const { current, previous } = periodsFor(now);
    const ranges = [
      { name: "current", startDate: current.start, endDate: current.end },
      { name: "previous", startDate: previous.start, endDate: previous.end },
    ];
    const id = property;
    const [totalsReport, channelsReport, pagesReport, configuredKeyEvents, keyEventsReport, organicEventsReport] = await Promise.all([
      runReport(token, id, { dateRanges: ranges, dimensions: ["dateRange"], metrics: ["activeUsers", "sessions", "screenPageViews"], limit: 2 }, options),
      runReport(token, id, { dateRanges: ranges, dimensions: ["sessionDefaultChannelGroup", "dateRange"], metrics: ["sessions"], limit: 100 }, options),
      runReport(
        token,
        id,
        { dateRanges: [ranges[0]!], dimensions: ["pagePath"], metrics: ["screenPageViews", "activeUsers"], orderBy: "screenPageViews", limit: TOP_PAGES },
        options,
      ),
      listKeyEvents(token, id, options),
      runReport(token, id, { dateRanges: ranges, dimensions: ["sessionDefaultChannelGroup", "dateRange"], metrics: ["keyEvents"], limit: 100 }, options),
      runReport(
        token,
        id,
        { dateRanges: [ranges[0]!], dimensions: ["eventName"], metrics: ["keyEvents"], orderBy: "keyEvents", limit: TOP_EVENTS, dimensionFilter: ORGANIC_FILTER },
        options,
      ),
    ]);

    // Every row of the period counts in the total, `(other)` included; organic only the exact channel.
    const keyEventSum = (range: string, organicOnly: boolean): number => {
      let sum = 0;
      for (const row of keyEventsReport.rows) {
        if (row.dimensions.dateRange !== range) continue;
        if (organicOnly && row.dimensions.sessionDefaultChannelGroup !== ORGANIC) continue;
        sum += row.metrics.keyEvents!;
      }
      if (sum > MAX_COUNT) throw new Ga4Error("error", "La suma de eventos clave de Google Analytics supera el máximo admitido");
      return sum;
    };

    const totalsFor = (range: string): Totals => {
      const row = totalsReport.rows.find((r) => r.dimensions.dateRange === range);
      return row ? { users: row.metrics.activeUsers!, sessions: row.metrics.sessions!, views: row.metrics.screenPageViews! } : ZERO;
    };

    // A channel may exist in one period only; the other counts as zero.
    const channels = new Map<string, ChannelRow>();
    for (const row of channelsReport.rows) {
      const channel = row.dimensions.sessionDefaultChannelGroup!.slice(0, MAX_CHANNEL_LENGTH);
      const entry = channels.get(channel) ?? { channel, sessions: 0, previousSessions: 0 };
      if (row.dimensions.dateRange === "current") entry.sessions += row.metrics.sessions!;
      else if (row.dimensions.dateRange === "previous") entry.previousSessions += row.metrics.sessions!;
      channels.set(channel, entry);
    }

    const reports = [totalsReport, channelsReport, pagesReport, keyEventsReport, organicEventsReport];
    return {
      ok: true,
      data: {
        property: id,
        propertyName: (properties.find((p) => p.property === id)?.displayName ?? "").slice(0, MAX_NAME_LENGTH),
        current,
        previous,
        totals: totalsFor("current"),
        previousTotals: totalsFor("previous"),
        channels: [...channels.values()]
          .filter((c) => c.sessions > 0 || c.previousSessions > 0)
          .sort((a, b) => b.sessions - a.sessions || b.previousSessions - a.previousSessions || a.channel.localeCompare(b.channel))
          .slice(0, TOP_CHANNELS),
        pages: pagesReport.rows.slice(0, TOP_PAGES).map((r) => ({ page: r.dimensions.pagePath!.slice(0, MAX_PAGE_LENGTH), views: r.metrics.screenPageViews!, users: r.metrics.activeUsers! })),
        quality: {
          otherRow: reports.some((r) => r.quality.otherRow),
          thresholded: reports.some((r) => r.quality.thresholded),
          sampled: reports.some((r) => r.quality.sampled),
        },
        keyEvents: {
          version: 1,
          configured: configuredKeyEvents.events,
          configuredMore: configuredKeyEvents.more,
          total: keyEventSum("current", false),
          previousTotal: keyEventSum("previous", false),
          organic: keyEventSum("current", true),
          previousOrganic: keyEventSum("previous", true),
          organicByEvent: organicEventsReport.rows
            .filter((r) => r.metrics.keyEvents! > 0)
            .slice(0, TOP_EVENTS)
            .map((r) => ({ event: r.dimensions.eventName!.slice(0, MAX_EVENT_NAME_LENGTH), keyEvents: r.metrics.keyEvents! })),
        },
      },
    };
  } catch (error) {
    if (error instanceof Ga4Error) return { ok: false, kind: error.kind, message: error.message, property, accessibleProperties: null, propertiesSkipped: null };
    // The token comes from Search Console's client; it only fails as rejected credentials or a generic error.
    if (error instanceof GscError) {
      return { ok: false, kind: error.kind === "invalid_credentials" ? "invalid_credentials" : "error", message: error.message, property, accessibleProperties: null, propertiesSkipped: null };
    }
    return { ok: false, kind: "error", message: "Error inesperado al leer Google Analytics", property, accessibleProperties: null, propertiesSkipped: null };
  }
}
