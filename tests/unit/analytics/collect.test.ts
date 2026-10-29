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
  /** Feature 008: configured key events (Admin API) and the two key event reports. */
  keyEventList?: Reply;
  keyEventsByChannel?: Reply;
  organicEvents?: Reply;
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
    else if (url.startsWith(ADMIN_BASE) && url.includes("/keyEvents")) reply = routes.keyEventList ?? { body: {} };
    else if (url.startsWith(ADMIN_BASE)) reply = routes.streams?.[url.slice(ADMIN_BASE.length + 1).split("/dataStreams")[0]!] ?? WEB("https://olessium.com");
    else if (url.startsWith(DATA_BASE)) {
      const request = JSON.parse(String(init?.body)) as { dimensions: { name: string }[]; metrics: { name: string }[] };
      const dims = request.dimensions.map((d) => d.name);
      if (request.metrics.some((m) => m.name === "keyEvents")) reply = dims.includes("eventName") ? routes.organicEvents : routes.keyEventsByChannel;
      else reply = dims.includes("pagePath") ? routes.pages : dims.includes("sessionDefaultChannelGroup") ? routes.channels : routes.totals;
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
        keyEvents: { version: 1, configured: [], configuredMore: false, total: 0, previousTotal: 0, organic: 0, previousOrganic: 0, organicByEvent: [] },
      },
    });
    // Three reports of 006 plus two key event reports and the key event list (feature 008).
    expect(g.urls().filter((u) => u.startsWith(DATA_BASE))).toEqual(Array(5).fill(`${DATA_BASE}/properties/123:runReport`));
    expect(g.urls()).toHaveLength(9);
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

describe("collectAnalytics key events (feature 008)", () => {
  const RANGES = [
    { name: "current", startDate: "2026-09-29", endDate: "2026-10-26" },
    { name: "previous", startDate: "2026-09-01", endDate: "2026-09-28" },
  ];
  const BY_CHANNEL = {
    body: report(["sessionDefaultChannelGroup", "dateRange"], ["keyEvents"], [
      [["Organic Search", "current"], [25]],
      [["Organic Search", "previous"], [10]],
      [["Direct", "current"], [60]],
      [["(other)", "current"], [15]],
      [["Referral", "previous"], [30]],
    ]),
  };
  const ORGANIC_EVENTS = {
    body: report(["eventName"], ["keyEvents"], [
      [["generate_lead"], [18]],
      [["(not set)"], [4]],
      [["x".repeat(150)], [3]],
      [["page_view"], [0]],
    ]),
  };
  const LIST = { body: { keyEvents: [{ eventName: "generate_lead" }, { eventName: "purchase" }] } };

  it("sends the key event list and the two reports with their exact bodies, the 006 reports unchanged (AC-002)", async () => {
    const g = google({ keyEventList: LIST, keyEventsByChannel: BY_CHANNEL, organicEvents: ORGANIC_EVENTS });
    await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW });
    expect(g.urls()).toContain(`${ADMIN_BASE}/properties/123/keyEvents?pageSize=200`);
    const keyEventBodies = g.bodies().filter((b) => b.metrics.some((m: { name: string }) => m.name === "keyEvents"));
    expect(keyEventBodies).toEqual([
      { dateRanges: RANGES, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "keyEvents" }], limit: "100" },
      {
        dateRanges: [RANGES[0]],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "keyEvents" }, desc: true }],
        dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: true } } },
        limit: "10",
      },
    ]);
    // The three reports of feature 006 keep exactly their bodies.
    const previous = g.bodies().filter((b) => !b.metrics.some((m: { name: string }) => m.name === "keyEvents"));
    expect(previous).toEqual([
      { dateRanges: RANGES, dimensions: [], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }], limit: "2" },
      { dateRanges: RANGES, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], limit: "100" },
      {
        dateRanges: [RANGES[0]],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: "10",
      },
    ]);
  });

  it("starts the six calls after the property before any of them answers (AC-002)", async () => {
    let waiting: (() => void)[] = [];
    let maxWaiting = 0;
    const inner = google({ keyEventList: LIST, keyEventsByChannel: BY_CHANNEL, organicEvents: ORGANIC_EVENTS }).fetchImpl;
    const fetchImpl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const afterProperty = url.startsWith(DATA_BASE) || url.includes("/keyEvents");
      if (afterProperty) {
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
          maxWaiting = Math.max(maxWaiting, waiting.length);
          if (waiting.length === 6) {
            const all = waiting;
            waiting = [];
            all.forEach((release) => release());
          } else setTimeout(() => waiting.splice(0).forEach((release) => release()), 200);
        });
      }
      return inner(input, init);
    }) as typeof fetch;
    expect((await collectAnalytics(account, SITE, { fetchImpl, now: NOW })).ok).toBe(true);
    expect(maxWaiting).toBe(6);
  });

  it("adds every row to the total, only the exact organic channel to organic, and keeps the positive breakdown (AC-003, AC-004)", async () => {
    const g = google({ keyEventList: LIST, keyEventsByChannel: BY_CHANNEL, organicEvents: ORGANIC_EVENTS });
    const outcome = await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW });
    expect(outcome.ok && outcome.data.keyEvents).toEqual({
      version: 1,
      configured: ["generate_lead", "purchase"],
      configuredMore: false,
      total: 100,
      previousTotal: 40,
      organic: 25,
      previousOrganic: 10,
      organicByEvent: [
        { event: "generate_lead", keyEvents: 18 },
        { event: "(not set)", keyEvents: 4 },
        { event: "x".repeat(100), keyEvents: 3 },
      ],
    });
  });

  it("does not count a channel name in another language as organic (AC-003)", async () => {
    const spanish = { body: report(["sessionDefaultChannelGroup", "dateRange"], ["keyEvents"], [[["Búsqueda orgánica", "current"], [9]]]) };
    const outcome = await collectAnalytics(account, SITE, { fetchImpl: google({ keyEventsByChannel: spanish }).fetchImpl, now: NOW });
    expect(outcome.ok && [outcome.data.keyEvents.total, outcome.data.keyEvents.organic]).toEqual([9, 0]);
  });

  it("fails when a period's sum goes over 10^12 (D007)", async () => {
    const huge = { body: report(["sessionDefaultChannelGroup", "dateRange"], ["keyEvents"], [[["A", "current"], [1e12]], [["B", "current"], [1]]]) };
    expect(await collectAnalytics(account, SITE, { fetchImpl: google({ keyEventsByChannel: huge }).fetchImpl, now: NOW })).toMatchObject({ ok: false, kind: "error" });
  });

  it("adds the quality flags of the two new reports (AC-003)", async () => {
    const thresholded = { body: report(["sessionDefaultChannelGroup", "dateRange"], ["keyEvents"], [], { subjectToThresholding: true }) };
    const sampled = { body: report(["eventName"], ["keyEvents"], [], { samplingMetadatas: [{}] }) };
    const otherRow = { body: report(["sessionDefaultChannelGroup", "dateRange"], ["keyEvents"], [], { dataLossFromOtherRow: true }) };
    const a = await collectAnalytics(account, SITE, { fetchImpl: google({ keyEventsByChannel: thresholded, organicEvents: sampled }).fetchImpl, now: NOW });
    expect(a.ok && a.data.quality).toEqual({ otherRow: false, thresholded: true, sampled: true });
    const b = await collectAnalytics(account, SITE, { fetchImpl: google({ keyEventsByChannel: otherRow }).fetchImpl, now: NOW });
    expect(b.ok && b.data.quality.otherRow).toBe(true);
  });

  const leaky = (status: number, extra: Record<string, unknown> = {}) => ({ status, body: { error: { message: `${TOKEN} ${PRIVATE_PEM}`, ...extra } } });
  it.each([
    ["the key event list", { keyEventList: leaky(403, { details: [{ reason: "SERVICE_DISABLED" }] }) }, "admin_api_disabled"],
    ["the report by channel", { keyEventsByChannel: leaky(403, { details: [{ reason: "SERVICE_DISABLED" }] }) }, "data_api_disabled"],
    ["the organic breakdown", { organicEvents: leaky(403) }, "no_access"],
    ["the key event list", { keyEventList: leaky(401) }, "invalid_credentials"],
    ["the report by channel", { keyEventsByChannel: leaky(429) }, "quota_exceeded"],
    ["the organic breakdown", { organicEvents: leaky(500) }, "error"],
    ["the report by channel", { keyEventsByChannel: { body: report(["sessionDefaultChannelGroup", "dateRange"], ["keyEvents"], [[["A", "current"], [1.5]]]) } }, "error"],
    ["the key event list", { keyEventList: { body: { keyEvents: [{ name: "x" }] } } }, "error"],
  ])("fails the whole capture when %s fails, with no secret in the outcome (AC-005)", async (_label, routes, kind) => {
    const g = google(routes as Routes);
    const outcome = await collectAnalytics(account, SITE, { fetchImpl: g.fetchImpl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind, property: "properties/123" });
    const assertion = new URLSearchParams(String((g.fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]?.body)).get("assertion")!;
    const text = JSON.stringify(outcome);
    for (const secret of [TOKEN, assertion, PRIVATE_PEM.split("\n")[1]!]) expect(text).not.toContain(secret);
  });
});
