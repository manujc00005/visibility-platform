import { describe, expect, it, vi } from "vitest";
import { collectAnalytics, periodsFor, pickProperty } from "@/modules/analytics/collect";
import { ADMIN_BASE, DATA_BASE } from "@/modules/analytics/ga4";
import { parseServiceAccount } from "@/modules/search-console/credentials";
import { TOKEN_ENDPOINT } from "@/modules/search-console/google";
import { PRIVATE_PEM, serviceAccountJson } from "../search-console/fixtures";

const TOKEN = "ya29.analytics-token";
const SITE = { domain: "olessium.com", hostname: "olessium.com" };
const NOW = new Date("2026-10-28T10:00:00Z");
const account = (() => {
  const parsed = parseServiceAccount(serviceAccountJson());
  if (!parsed?.ok) throw new Error("fixture");
  return parsed.value;
})();

type Reply = { status?: number; body: unknown };
interface Routes {
  token?: Reply;
  summaries?: Reply;
  streams?: Record<string, Reply>;
  totals?: Reply;
  channels?: Reply;
  pages?: Reply;
}

const report = (dimensions: string[], metrics: string[], rows: [string[], number[]][], metadata: unknown = {}) => ({
  dimensionHeaders: dimensions.map((name) => ({ name })),
  metricHeaders: metrics.map((name) => ({ name })),
  rows: rows.map(([d, m]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((v) => ({ value: String(v) })) })),
  metadata,
});

const OLESSIUM = { body: { accountSummaries: [{ propertySummaries: [{ property: "properties/123", displayName: "Olessium" }] }] } };
const WEB = (uri: string) => ({ body: { dataStreams: [{ type: "WEB_DATA_STREAM", webStreamData: { defaultUri: uri } }] } });

function google(routes: Routes) {
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    let reply: Reply | undefined;
    if (url === TOKEN_ENDPOINT) reply = routes.token ?? { body: { access_token: TOKEN } };
    else if (url.startsWith(`${ADMIN_BASE}/accountSummaries`)) reply = routes.summaries ?? OLESSIUM;
    else if (url.startsWith(ADMIN_BASE)) reply = routes.streams?.[url.slice(ADMIN_BASE.length + 1).split("/dataStreams")[0]!] ?? WEB("https://olessium.com");
    else if (url.startsWith(DATA_BASE)) {
      const dims = (JSON.parse(String(init?.body)) as { dimensions: { name: string }[] }).dimensions.map((d) => d.name);
      reply = dims.includes("pagePath") ? routes.pages : dims.includes("sessionDefaultChannelGroup") ? routes.channels : routes.totals;
      reply ??= { body: {} };
    }
    return new Response(JSON.stringify(reply?.body ?? {}), { status: reply?.status ?? 200 });
  });
  return {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    urls: () => fetchImpl.mock.calls.map(([u]) => String(u)),
    bodies: () => fetchImpl.mock.calls.filter(([u]) => String(u).startsWith(DATA_BASE)).map(([, i]) => JSON.parse(String(i?.body))),
  };
}

describe("periodsFor", () => {
  it("ends two days before the UTC day and covers 28 + 28 days across a month change", () => {
    expect(periodsFor(NOW)).toEqual({ current: { start: "2026-09-29", end: "2026-10-26" }, previous: { start: "2026-09-01", end: "2026-09-28" } });
    expect(periodsFor(new Date("2026-03-02T23:59:00Z")).current).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("pickProperty", () => {
  const c = (property: string, ...hosts: string[]) => ({ property, hosts });

  it("prefers the stored host, then the bare domain, then www", () => {
    const candidates = [c("properties/1", "www.olessium.com"), c("properties/2", "olessium.com")];
    expect(pickProperty(candidates, SITE)).toBe("properties/2");
    expect(pickProperty(candidates, { domain: "olessium.com", hostname: "www.olessium.com" })).toBe("properties/1");
    expect(pickProperty([c("properties/1", "www.olessium.com")], SITE)).toBe("properties/1");
  });

  it("breaks ties by the lowest numeric id and ignores properties without a matching stream", () => {
    expect(pickProperty([c("properties/90", "olessium.com"), c("properties/100", "olessium.com"), c("properties/5")], SITE)).toBe("properties/90");
    expect(pickProperty([c("properties/5"), c("properties/6", "other.com")], SITE)).toBeNull();
  });
});

describe("collectAnalytics", () => {
  const TOTALS = { body: report(["dateRange"], ["activeUsers", "sessions", "screenPageViews"], [[["current"], [80, 120, 300]], [["previous"], [60, 100, 250]]]) };
  const CHANNELS = {
    body: report(["sessionDefaultChannelGroup", "dateRange"], ["sessions"], [
      [["Organic Search", "current"], [70]],
      [["Organic Search", "previous"], [50]],
      [["Direct", "current"], [50]],
      [["Referral", "previous"], [50]],
    ]),
  };
  const PAGES = { body: report(["pagePath"], ["screenPageViews", "activeUsers"], [[["/"], [200, 70]], [["/es/tienda"], [100, 30]]], { subjectToThresholding: true }) };

  it("finds the property, asks for three reports and builds periods, totals, channels and pages", async () => {
    const g = google({ totals: TOTALS, channels: CHANNELS, pages: PAGES });
    const outcome = await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW });
    expect(outcome).toEqual({
      ok: true,
      data: {
        property: "properties/123",
        propertyName: "Olessium",
        current: { start: "2026-09-29", end: "2026-10-26" },
        previous: { start: "2026-09-01", end: "2026-09-28" },
        totals: { users: 80, sessions: 120, views: 300 },
        previousTotals: { users: 60, sessions: 100, views: 250 },
        channels: [
          { channel: "Organic Search", sessions: 70, previousSessions: 50 },
          { channel: "Direct", sessions: 50, previousSessions: 0 },
          { channel: "Referral", sessions: 0, previousSessions: 50 },
        ],
        pages: [
          { page: "/", views: 200, users: 70 },
          { page: "/es/tienda", views: 100, users: 30 },
        ],
        quality: { otherRow: false, thresholded: true, sampled: false },
      },
    });
    expect(g.urls().filter((u) => u.startsWith(DATA_BASE))).toEqual(Array(3).fill(`${DATA_BASE}/properties/123:runReport`));
    expect(g.urls()).toHaveLength(6);
    const pages = g.bodies().find((b) => b.dimensions[0]?.name === "pagePath");
    expect(pages.dateRanges).toEqual([{ name: "current", startDate: "2026-09-29", endDate: "2026-10-26" }]);
  });

  it("signs the token for Analytics", async () => {
    const g = google({});
    await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW });
    const call = (g.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const assertion = new URLSearchParams(String(call[1]?.body)).get("assertion")!;
    expect(JSON.parse(Buffer.from(assertion.split(".")[1]!, "base64url").toString()).scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
  });

  it("stores zeros when GA4 has no rows, and a period without a row counts as zero", async () => {
    const empty = await collectAnalytics(account, SITE, { fetchImpl: google({}).fetchImpl, now: NOW });
    expect(empty).toMatchObject({ ok: true, data: { totals: { users: 0, sessions: 0, views: 0 }, previousTotals: { users: 0, sessions: 0, views: 0 }, channels: [], pages: [] } });
    const onlyCurrent = { body: report(["dateRange"], ["activeUsers", "sessions", "screenPageViews"], [[["current"], [1, 2, 3]]]) };
    const outcome = await collectAnalytics(account, SITE, { fetchImpl: google({ totals: onlyCurrent }).fetchImpl, now: NOW });
    expect(outcome).toMatchObject({ ok: true, data: { totals: { users: 1, sessions: 2, views: 3 }, previousTotals: { users: 0, sessions: 0, views: 0 } } });
  });

  it("reports how many properties it saw when none has the company's website", async () => {
    const g = google({ streams: { "properties/123": WEB("https://other.com") } });
    expect(await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW })).toMatchObject({
      ok: false,
      kind: "no_access",
      accessibleProperties: 1,
      propertiesSkipped: false,
    });
    expect(g.urls().some((u) => u.startsWith(DATA_BASE))).toBe(false);
  });

  it("checks at most 20 properties, in series, and says when some were skipped", async () => {
    const many = { body: { accountSummaries: [{ propertySummaries: Array.from({ length: 25 }, (_, i) => ({ property: `properties/${i + 1}` })) }] } };
    const streams = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`properties/${i + 1}`, WEB("https://other.com")]));
    const g = google({ summaries: many, streams });
    expect(await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW })).toMatchObject({ ok: false, kind: "no_access", accessibleProperties: 25, propertiesSkipped: true });
    expect(g.urls().filter((u) => u.includes("/dataStreams"))).toHaveLength(20);
    const paged = google({ summaries: { body: { ...OLESSIUM.body, nextPageToken: "x" } }, streams: { "properties/123": WEB("https://other.com") } });
    expect(await collectAnalytics(account, SITE, { fetchImpl: paged.fetchImpl, now: NOW })).toMatchObject({ propertiesSkipped: true });
  });

  it("translates a rejected token and keeps the property when a report fails", async () => {
    expect(await collectAnalytics(account, SITE, { fetchImpl: google({ token: { status: 400, body: { error: "invalid_grant" } } }).fetchImpl, now: NOW })).toMatchObject({
      ok: false,
      kind: "invalid_credentials",
      property: null,
    });
    const disabled = { status: 403, body: { error: { details: [{ reason: "SERVICE_DISABLED" }] } } };
    expect(await collectAnalytics(account, SITE, { fetchImpl: google({ channels: disabled }).fetchImpl, now: NOW })).toMatchObject({
      ok: false,
      kind: "data_api_disabled",
      property: "properties/123",
    });
    expect(await collectAnalytics(account, SITE, { fetchImpl: google({ summaries: disabled }).fetchImpl, now: NOW })).toMatchObject({ ok: false, kind: "admin_api_disabled" });
  });

  it("never carries the token or the private key in any outcome", async () => {
    const leaky = (status: number) => ({ status, body: { error: { message: `${TOKEN} ${PRIVATE_PEM}` } } });
    const cases: Routes[] = [
      { token: leaky(401) },
      { summaries: leaky(403) },
      { streams: { "properties/123": leaky(429) } },
      { totals: leaky(500) },
      { pages: { body: report(["pagePath"], ["screenPageViews", "activeUsers"], [[[TOKEN], [1, 1]]]) } },
      { channels: { body: report(["sessionDefaultChannelGroup", "dateRange"], ["sessions"], [[["x", "current"], [Number.NaN]]]) } },
    ];
    for (const routes of cases) {
      const outcome = await collectAnalytics(account, SITE, { fetchImpl: google(routes).fetchImpl, now: NOW });
      const text = JSON.stringify(outcome);
      if (!outcome.ok) expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("PRIVATE KEY");
    }
    const network = (async () => Promise.reject(new TypeError(`fetch failed ${TOKEN}`))) as unknown as typeof fetch;
    expect(JSON.stringify(await collectAnalytics(account, SITE, { fetchImpl: network, now: NOW }))).not.toContain(TOKEN);
  });
});
