import { describe, expect, it, vi } from "vitest";
import { aggregate, collectBingWebmaster, pickSite, trafficPeriods } from "@/modules/bing-webmaster/collect";
import type { StatsRow } from "@/modules/bing-webmaster/bing";

const KEY = "EEDECC1EA4AE341CC57365E075EBC8B6";
const SITE = { domain: "olessium.com", hostname: "olessium.com" };
const DAY_MS = 86_400_000;

/** `/Date()/` for midnight UTC of an ISO day. */
const bingDate = (day: string) => `/Date(${Date.parse(`${day}T00:00:00Z`)})/`;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

type Routes = Partial<Record<"GetUserSites" | "GetRankAndTrafficStats" | "GetQueryStats" | "GetPageStats", { status?: number; body: unknown }>>;

function bing(routes: Routes) {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const method = new URL(String(input)).pathname.split("/").pop() as keyof Routes;
    const route = routes[method] ?? { body: { d: [] } };
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, methods: () => fetchImpl.mock.calls.map(([u]) => new URL(String(u)).pathname.split("/").pop()) };
}

const verified = (Url: string) => ({ Url, IsVerified: true });
const statsRow = (Query: string, day: string, Clicks: number, Impressions: number, AvgImpressionPosition: number) => ({
  Query,
  Date: bingDate(day),
  Clicks,
  Impressions,
  AvgClickPosition: AvgImpressionPosition,
  AvgImpressionPosition,
});

describe("pickSite", () => {
  const sites = (...urls: [string, boolean][]) => urls.map(([url, isVerified]) => ({ url, isVerified }));

  it("prefers https host, then bare domain, then www, then http; ignoring case and trailing slash", () => {
    expect(pickSite(sites(["http://olessium.com/", true], ["https://WWW.olessium.com", true]), SITE)).toEqual({ url: "https://WWW.olessium.com", isVerified: true });
    expect(pickSite(sites(["http://olessium.com", true]), SITE)).toEqual({ url: "http://olessium.com", isVerified: true });
    expect(pickSite(sites(["https://www.olessium.com/", true]), { domain: "olessium.com", hostname: "www.olessium.com" })?.url).toBe("https://www.olessium.com/");
  });

  it("prefers a verified match over an unverified one and reports the unverified otherwise", () => {
    expect(pickSite(sites(["https://olessium.com/", false], ["http://olessium.com/", true]), SITE)).toEqual({ url: "http://olessium.com/", isVerified: true });
    expect(pickSite(sites(["https://olessium.com/", false]), SITE)).toEqual({ url: "https://olessium.com/", isVerified: false });
  });

  it("ignores other sites and paths", () => {
    expect(pickSite(sites(["https://olessium.com.evil.com/", true], ["https://olessium.com/blog/", true], ["https://other.com/", true]), SITE)).toBeNull();
  });
});

describe("trafficPeriods", () => {
  it("ends on the last day with data and counts missing days as zero", () => {
    const end = "2026-10-26";
    const days = [
      { day: end, clicks: 2, impressions: 10 },
      { day: addDays(end, -27), clicks: 1, impressions: 10 }, // first day of the current period
      { day: addDays(end, -28), clicks: 5, impressions: 50 }, // last day of the previous one
      { day: addDays(end, -55), clicks: 1, impressions: 0 },
      { day: addDays(end, -56), clicks: 99, impressions: 99 }, // outside both
    ];
    expect(trafficPeriods(days)).toEqual({
      current: { start: addDays(end, -27), end },
      previous: { start: addDays(end, -55), end: addDays(end, -28) },
      totals: { clicks: 3, impressions: 20, ctr: 0.15 },
      previousTotals: { clicks: 6, impressions: 50, ctr: 0.12 },
    });
  });

  it("ignores trailing days without clicks or impressions", () => {
    const p = trafficPeriods([
      { day: "2026-10-20", clicks: 1, impressions: 10 },
      { day: "2026-10-26", clicks: 0, impressions: 0 },
    ]);
    expect(p?.current.end).toBe("2026-10-20");
  });

  it("handles less than 56 days and no data", () => {
    const short = trafficPeriods([{ day: "2026-10-26", clicks: 0, impressions: 0 }]);
    expect(short?.previousTotals).toEqual({ clicks: 0, impressions: 0, ctr: 0 });
    expect(short?.totals.ctr).toBe(0);
    expect(trafficPeriods([])).toBeNull();
  });
});

describe("aggregate", () => {
  const row = (key: string, day: string, clicks: number, impressions: number, position: number | null): StatsRow => ({ key, day, clicks, impressions, position });

  it("groups repeated keys, weights position by impressions and ignores missing positions", () => {
    const { rows, window } = aggregate(
      [row("a", "2026-05-03", 1, 10, 2), row("a", "2026-10-25", 3, 30, 6), row("a", "2026-10-25", 0, 5, null), row("b", "2026-08-01", 0, 4, null)],
      10,
    );
    expect(rows).toEqual([
      { key: "a", clicks: 4, impressions: 45, ctr: 4 / 45, position: 5 },
      { key: "b", clicks: 0, impressions: 4, ctr: 0, position: null },
    ]);
    expect(window).toEqual({ start: "2026-05-03", end: "2026-10-25" });
  });

  it("orders by clicks, then impressions, then key, and keeps the top N", () => {
    const { rows } = aggregate([row("c", "2026-10-01", 1, 5, 1), row("b", "2026-10-01", 1, 9, 1), row("a", "2026-10-01", 1, 9, 1), row("d", "2026-10-01", 2, 1, 1)], 3);
    expect(rows.map((r) => r.key)).toEqual(["d", "a", "b"]);
  });

  it("has no window without rows", () => {
    expect(aggregate([], 5)).toEqual({ rows: [], window: null });
  });
});

describe("collectBingWebmaster", () => {
  it("reads sites, traffic, queries and pages in series, at most 4 calls", async () => {
    const end = "2026-10-26";
    const { fetchImpl, methods } = bing({
      GetUserSites: { body: { d: [verified("https://olessium.com/")] } },
      GetRankAndTrafficStats: { body: { d: [{ Date: bingDate(end), Clicks: 4, Impressions: 40 }] } },
      GetQueryStats: { body: { d: [statsRow("ropa trail", "2026-10-20", 3, 30, 4)] } },
      GetPageStats: { body: { d: [statsRow("https://olessium.com/es", "2026-10-20", 3, 30, 4)] } },
    });
    const outcome = await collectBingWebmaster(KEY, SITE, { fetchImpl });
    expect(methods()).toEqual(["GetUserSites", "GetRankAndTrafficStats", "GetQueryStats", "GetPageStats"]);
    expect(outcome).toEqual({
      ok: true,
      data: {
        siteUrl: "https://olessium.com/",
        current: { start: addDays(end, -27), end },
        previous: { start: addDays(end, -55), end: addDays(end, -28) },
        totals: { clicks: 4, impressions: 40, ctr: 0.1 },
        previousTotals: { clicks: 0, impressions: 0, ctr: 0 },
        queries: [{ query: "ropa trail", clicks: 3, impressions: 30, ctr: 0.1, position: 4 }],
        pages: [{ page: "https://olessium.com/es", clicks: 3, impressions: 30, ctr: 0.1, position: 4 }],
        rows: { start: "2026-10-20", end: "2026-10-20" },
      },
    });
  });

  it("succeeds with nothing while Bing is still processing a new site", async () => {
    const { fetchImpl } = bing({ GetUserSites: { body: { d: [verified("https://olessium.com/")] } } });
    expect(await collectBingWebmaster(KEY, SITE, { fetchImpl })).toEqual({
      ok: true,
      data: { siteUrl: "https://olessium.com/", current: null, previous: null, totals: null, previousTotals: null, queries: [], pages: [], rows: null },
    });
  });

  it("keeps the 25 top queries and 10 top pages", async () => {
    const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => statsRow(`${prefix}${i}`, "2026-10-20", i, 100, 3));
    const { fetchImpl } = bing({
      GetUserSites: { body: { d: [verified("https://olessium.com/")] } },
      GetQueryStats: { body: { d: many("q", 40) } },
      GetPageStats: { body: { d: many("https://olessium.com/p", 40) } },
    });
    const outcome = await collectBingWebmaster(KEY, SITE, { fetchImpl });
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.data.queries).toHaveLength(25);
    expect(outcome.data.pages).toHaveLength(10);
    expect(outcome.data.queries[0]!.query).toBe("q39");
  });

  it("reports a missing site with how many verified sites the key sees, without further calls", async () => {
    const { fetchImpl, methods } = bing({ GetUserSites: { body: { d: [verified("https://a.com/"), verified("https://b.com/"), { Url: "https://c.com/", IsVerified: false }] } } });
    const outcome = await collectBingWebmaster(KEY, SITE, { fetchImpl });
    expect(outcome).toMatchObject({ ok: false, kind: "no_access", siteUrl: null, verifiedSites: 2 });
    expect(methods()).toEqual(["GetUserSites"]);
  });

  it("reports an unverified site", async () => {
    const { fetchImpl } = bing({ GetUserSites: { body: { d: [{ Url: "https://olessium.com/", IsVerified: false }] } } });
    expect(await collectBingWebmaster(KEY, SITE, { fetchImpl })).toMatchObject({ ok: false, kind: "not_verified", siteUrl: "https://olessium.com/", verifiedSites: null });
  });

  it("turns client errors into typed failures that never carry the key", async () => {
    const site = { GetUserSites: { body: { d: [verified("https://olessium.com/")] } } };
    const cases: Routes[] = [
      { GetUserSites: { status: 400, body: { ErrorCode: 3, Message: `InvalidApiKey ${KEY}` } } },
      { GetUserSites: { status: 400, body: { ErrorCode: 6, Message: KEY } } },
      { GetUserSites: { status: 400, body: { ErrorCode: 10, Message: KEY } } },
      { ...site, GetQueryStats: { status: 400, body: { ErrorCode: 4, Message: KEY } } },
      { ...site, GetPageStats: { status: 400, body: { ErrorCode: 5, Message: KEY } } },
      { ...site, GetRankAndTrafficStats: { status: 400, body: { ErrorCode: 11, Message: KEY } } },
      { ...site, GetRankAndTrafficStats: { status: 400, body: { ErrorCode: 14, Message: KEY } } },
      { ...site, GetQueryStats: { status: 400, body: { ErrorCode: 1, Message: KEY } } },
      { ...site, GetRankAndTrafficStats: { status: 500, body: { Message: KEY } } },
      { ...site, GetPageStats: { status: 401, body: { Message: KEY } } },
      { ...site, GetPageStats: { status: 400, body: `not json ${KEY}` } },
      { ...site, GetPageStats: { body: { d: [{ Query: KEY, Date: "nope" }] } } },
    ];
    const kinds = [];
    for (const routes of cases) {
      const outcome = await collectBingWebmaster(KEY, SITE, { fetchImpl: bing(routes).fetchImpl });
      expect(JSON.stringify(outcome)).not.toContain(KEY);
      kinds.push(outcome.ok ? "ok" : outcome.kind);
    }
    const network = (async () => Promise.reject(new TypeError(`fetch failed for ?apikey=${KEY}`))) as unknown as typeof fetch;
    const outcome = await collectBingWebmaster(KEY, SITE, { fetchImpl: network });
    expect(JSON.stringify(outcome)).not.toContain(KEY);
    kinds.push(outcome.ok ? "ok" : outcome.kind);
    expect(kinds).toEqual([
      "invalid_credentials",
      "invalid_credentials",
      "invalid_credentials",
      "quota_exceeded",
      "quota_exceeded",
      "no_access",
      "no_access",
      "error",
      "error",
      "error",
      "error",
      "error",
      "error",
    ]);
  });
});
