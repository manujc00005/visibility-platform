import { describe, expect, it } from "vitest";
import { brandTerms } from "@/modules/search-console/brand-terms";
import { collectSearchConsole, periodsFor, pickProperty } from "@/modules/search-console/collect";
import { parseServiceAccount } from "@/modules/search-console/credentials";
import { PRIVATE_PEM, serviceAccountJson } from "./fixtures";

const parsed = parseServiceAccount(serviceAccountJson());
if (!parsed?.ok) throw new Error("fixture");
const account = parsed.value;
const site = { domain: "olessium.com", hostname: "olessium.com", name: "Olessium", brandAliases: ["Olessium Agency"] };
const NOW = new Date("2026-10-27T10:00:00Z");

describe("periodsFor", () => {
  it("ends 3 days back and covers two consecutive 28-day windows", () => {
    expect(periodsFor(NOW)).toEqual({
      current: { start: "2026-09-27", end: "2026-10-24" },
      previous: { start: "2026-08-30", end: "2026-09-26" },
    });
  });

  it("crosses month and year boundaries", () => {
    expect(periodsFor(new Date("2027-01-02T23:59:59Z")).current).toEqual({ start: "2026-12-03", end: "2026-12-30" });
  });
});

describe("pickProperty", () => {
  const entry = (siteUrl: string, permissionLevel = "siteFullUser") => ({ siteUrl, permissionLevel });

  it("prefers the domain property", () => {
    expect(pickProperty([entry("https://olessium.com/"), entry("sc-domain:olessium.com")], site)).toBe("sc-domain:olessium.com");
  });

  it("falls back to URL-prefix properties, https before http", () => {
    expect(pickProperty([entry("http://olessium.com/"), entry("https://www.olessium.com/")], site)).toBe("https://www.olessium.com/");
    expect(pickProperty([entry("http://olessium.com/")], site)).toBe("http://olessium.com/");
  });

  it("uses the stored host first when it differs from the domain", () => {
    const www = { domain: "e.es", hostname: "www.e.es" };
    expect(pickProperty([entry("https://e.es/"), entry("https://www.e.es/")], www)).toBe("https://www.e.es/");
  });

  it("ignores unverified access, other domains and lookalikes", () => {
    expect(pickProperty([entry("sc-domain:olessium.com", "siteUnverifiedUser")], site)).toBeNull();
    expect(pickProperty([entry("sc-domain:notolessium.com"), entry("https://olessium.com.evil.es/")], site)).toBeNull();
  });
});

const totals = (clicks: number, impressions: number) => ({ rows: [{ clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: 9.4 }] });

describe("collectSearchConsole", () => {
  function google(sites: unknown, analytics: (body: Record<string, unknown>) => unknown) {
    const calls: { url: string; body: string }[] = [];
    const impl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      calls.push({ url, body });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok" });
      if (url.endsWith("/sites")) return Response.json(sites);
      return Response.json(analytics(JSON.parse(body)));
    }) as typeof fetch;
    return { calls, impl };
  }

  it("collects totals for both periods and the top queries and pages", async () => {
    const { calls, impl } = google({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] }, (body) => {
      const dims = body.dimensions as string[];
      if (body.dimensionFilterGroups) return {};
      if (dims.length === 0) return body.startDate === "2026-09-27" ? totals(12, 400) : totals(8, 300);
      if (dims[0] === "query") return { rows: [{ keys: ["crm agencia ".repeat(30)], clicks: 5, impressions: 50, ctr: 0.1, position: 4.2 }] };
      return { rows: [{ keys: ["https://olessium.com/es"], clicks: 10, impressions: 300, ctr: 0.033, position: 8.1 }] };
    });
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data).toMatchObject({
      property: "sc-domain:olessium.com",
      current: { start: "2026-09-27", end: "2026-10-24" },
      totals: { clicks: 12, impressions: 400 },
      previousTotals: { clicks: 8, impressions: 300 },
      pages: [{ page: "https://olessium.com/es", clicks: 10 }],
    });
    expect(outcome.data.queries[0]!.query).toHaveLength(200);
    // token + sites + 4 queries + 4 brand-filtered totals (007) + previous queries (009).
    expect(calls).toHaveLength(11);
  });

  it("returns zeros, not an error, for a property without data", async () => {
    const { impl } = google({ siteEntry: [{ siteUrl: "https://olessium.com/", permissionLevel: "siteFullUser" }] }, () => ({}));
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok && outcome.data.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it("reports no_access with how many properties the account can read", async () => {
    const { calls, impl } = google({ siteEntry: [{ siteUrl: "sc-domain:other.es", permissionLevel: "siteOwner" }] }, () => ({}));
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind: "no_access", property: null, accessibleProperties: 1 });
    expect(calls).toHaveLength(2);
  });

  it("keeps the property when a later query fails", async () => {
    const impl = (async (input: string) => {
      const url = String(input);
      if (url.includes("oauth2")) return Response.json({ access_token: "tok" });
      if (url.endsWith("/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] });
      return Response.json({}, { status: 429 });
    }) as typeof fetch;
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind: "quota_exceeded", property: "sc-domain:olessium.com" });
  });
});

describe("collectSearchConsole brand segments (feature 007)", () => {
  const SECRET_TOKEN = "ya29.secret-access-token";
  const owned = { siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] };
  const isFiltered = (body: Record<string, unknown>) => Boolean(body.dimensionFilterGroups);
  const operatorOf = (body: Record<string, unknown>) =>
    (body.dimensionFilterGroups as { filters: { operator: string }[] }[])[0]!.filters[0]!.operator;

  /** Google double; `analytics` answers each Search Analytics body, `hold` lets a test delay them. */
  function google(analytics: (body: Record<string, unknown>) => Response | unknown, hold?: (start: () => void) => Promise<void>) {
    const calls: { url: string; body: string }[] = [];
    const impl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      calls.push({ url, body });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: SECRET_TOKEN });
      if (url.endsWith("/sites")) return Response.json(owned);
      if (hold) await hold(() => undefined);
      const answer = analytics(JSON.parse(body));
      return answer instanceof Response ? answer : Response.json(answer);
    }) as typeof fetch;
    const analyticsBodies = () => calls.filter((c) => c.url.includes("searchAnalytics")).map((c) => JSON.parse(c.body) as Record<string, unknown>);
    return { calls, impl, analyticsBodies };
  }

  it("sends four brand-filtered totals next to the four unchanged queries (AC-003)", async () => {
    const { calls, impl, analyticsBodies } = google(() => ({}));
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(11);
    const bodies = analyticsBodies();
    const current = { startDate: "2026-09-27", endDate: "2026-10-24" };
    const previous = { startDate: "2026-08-30", endDate: "2026-09-26" };
    const common = { type: "web", dataState: "final" };
    // The four queries of feature 003 keep exactly their previous body.
    expect(bodies.filter((b) => !isFiltered(b))).toEqual([
      { ...current, dimensions: [], rowLimit: 1, ...common },
      { ...previous, dimensions: [], rowLimit: 1, ...common },
      { ...current, dimensions: ["query"], rowLimit: 25, ...common },
      { ...current, dimensions: ["page"], rowLimit: 10, ...common },
      { ...previous, dimensions: ["query"], rowLimit: 1000, ...common },
    ]);
    const filter = (operator: string) => [{ groupType: "and", filters: [{ dimension: "query", operator, expression: brandTerms(site).expression }] }];
    expect(bodies.filter(isFiltered)).toEqual([
      { ...current, dimensions: [], rowLimit: 1, dimensionFilterGroups: filter("includingRegex"), ...common },
      { ...current, dimensions: [], rowLimit: 1, dimensionFilterGroups: filter("excludingRegex"), ...common },
      { ...previous, dimensions: [], rowLimit: 1, dimensionFilterGroups: filter("includingRegex"), ...common },
      { ...previous, dimensions: [], rowLimit: 1, dimensionFilterGroups: filter("excludingRegex"), ...common },
    ]);
    for (const c of calls.filter((c) => c.url.includes("searchAnalytics"))) {
      expect(c.url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aolessium.com/searchAnalytics/query");
    }
  });

  it("starts all nine Search Analytics queries before any of them answers (AC-003, AC-002 of 009)", async () => {
    let started = 0;
    let maxWaiting = 0;
    const waiting: (() => void)[] = [];
    const hold = () =>
      new Promise<void>((resolve) => {
        started += 1;
        waiting.push(resolve);
        maxWaiting = Math.max(maxWaiting, waiting.length);
        if (waiting.length === 9) waiting.splice(0).forEach((release) => release());
        // Safety net so a sequential implementation fails the assertion instead of hanging.
        else setTimeout(() => waiting.splice(0).forEach((release) => release()), 200);
      });
    const { impl } = google(() => ({}), hold);
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok).toBe(true);
    expect(started).toBe(9);
    expect(maxWaiting).toBe(9);
  });

  it("stores the terms and each segment's own totals, zero when Google returns no row (AC-001, AC-004)", async () => {
    const { impl } = google((body) => {
      if (!isFiltered(body)) return body.dimensions && (body.dimensions as string[]).length === 0 ? totals(100, 1000) : {};
      const now = body.startDate === "2026-09-27";
      if (operatorOf(body) === "includingRegex") return now ? { rows: [{ clicks: 30, impressions: 120, ctr: 0.25, position: 1.8 }] } : {};
      return now ? { rows: [{ clicks: 50, impressions: 700, ctr: 0.071, position: 14.2 }] } : { rows: [{ clicks: 40, impressions: 650, ctr: 0.062, position: 15 }] };
    });
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok && outcome.data.segments).toEqual({
      version: 1,
      terms: ["Olessium", "Olessium Agency", "olessium.com"],
      termsTruncated: false,
      branded: { clicks: 30, impressions: 120, ctr: 0.25, position: 1.8 },
      nonBranded: { clicks: 50, impressions: 700, ctr: 0.071, position: 14.2 },
      previousBranded: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      previousNonBranded: { clicks: 40, impressions: 650, ctr: 0.062, position: 15 },
    });
  });

  it("marks the segments as truncated when a long alias does not fit (AC-012)", async () => {
    const { impl } = google(() => ({}));
    const outcome = await collectSearchConsole(account, { ...site, brandAliases: ["a".repeat(4100), "olessium seo"] }, { fetchImpl: impl, now: NOW });
    expect(outcome.ok && outcome.data.segments.terms).toEqual(["Olessium", "olessium seo", "olessium.com"]);
    expect(outcome.ok && outcome.data.segments.termsTruncated).toBe(true);
  });

  it.each([
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "api_disabled"],
    [403, { error: { message: "User does not have sufficient permission for site." } }, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("fails the whole capture when a brand query answers %i (AC-007)", async (status, body, kind) => {
    const { calls, impl } = google((request) =>
      isFiltered(request) && operatorOf(request) === "excludingRegex" && request.startDate === "2026-08-30" ? Response.json(body, { status }) : {},
    );
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind, property: "sc-domain:olessium.com" });
    expect(outcome).not.toHaveProperty("data");
    // Nothing secret travels in the failure: not the token, the signed JWT, the key or the expression.
    const jwt = new URLSearchParams(calls[0]!.body).get("assertion")!;
    const keyBody = PRIVATE_PEM.split("\n")[1]!;
    const serialized = JSON.stringify(outcome);
    for (const secret of [SECRET_TOKEN, jwt, keyBody, brandTerms(site).expression]) expect(serialized).not.toContain(secret);
  });

  it("fails without any request when the domain alone does not fit the expression limit (AC-012)", async () => {
    const { calls, impl } = google(() => ({}));
    const huge = { ...site, domain: `${"d".repeat(4100)}.es` };
    const outcome = await collectSearchConsole(account, huge, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind: "error", property: null, accessibleProperties: null });
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(outcome)).not.toContain("dddd");
  });
});

describe("collectSearchConsole previous position per query (feature 009)", () => {
  const SECRET = "ya29.secret-access-token-009";
  const owned = { siteEntry: [{ siteUrl: "sc-domain:olessium.com", permissionLevel: "siteOwner" }] };
  const row = (query: string, clicks: number, position: number) => ({ keys: [query], clicks, impressions: clicks * 10, ctr: 0.1, position });
  const isQueries = (b: Record<string, unknown>) => (b.dimensions as string[])[0] === "query";

  function google(now: unknown[], before: unknown[] | Response) {
    const calls: { url: string; body: string }[] = [];
    const impl = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      calls.push({ url, body });
      if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: SECRET });
      if (url.endsWith("/sites")) return Response.json(owned);
      const request = JSON.parse(body) as Record<string, unknown>;
      if (!isQueries(request)) return Response.json({});
      if (request.startDate === "2026-09-27") return Response.json({ rows: now });
      return before instanceof Response ? before : Response.json({ rows: before });
    }) as typeof fetch;
    return { calls, impl };
  }

  it("stores the previous figures of each top query, or null, and no other row (AC-001)", async () => {
    const { impl } = google([row("crm agencias", 5, 8), row("olessium", 3, 1.2)], [row("seo madrid", 9, 4), row("crm agencias", 2, 12)]);
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok && outcome.data.queries).toEqual([
      { query: "crm agencias", clicks: 5, impressions: 50, ctr: 0.1, position: 8, previous: { clicks: 2, impressions: 20, ctr: 0.1, position: 12 } },
      { query: "olessium", clicks: 3, impressions: 30, ctr: 0.1, position: 1.2, previous: null },
    ]);
  });

  it("asks for the previous period and keeps the other eight bodies as exact strings (AC-002)", async () => {
    const { calls, impl } = google([], []);
    await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    const raw = calls.filter((c) => c.url.includes("searchAnalytics")).map((c) => c.body);
    expect(raw).toHaveLength(9);
    const range = (a: string, b: string) => ({ startDate: a, endDate: b });
    const body = (period: object, dimensions: string[], rowLimit: number) => JSON.stringify({ ...period, dimensions, rowLimit, type: "web", dataState: "final" });
    const current = range("2026-09-27", "2026-10-24");
    const previous = range("2026-08-30", "2026-09-26");
    expect(raw.slice(0, 4)).toEqual([body(current, [], 1), body(previous, [], 1), body(current, ["query"], 25), body(current, ["page"], 10)]);
    const filtered = (period: object, operator: string) =>
      JSON.stringify({
        ...period,
        dimensions: [],
        rowLimit: 1,
        dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "query", operator, expression: brandTerms(site).expression }] }],
        type: "web",
        dataState: "final",
      });
    expect(raw.slice(4, 8)).toEqual([
      filtered(current, "includingRegex"),
      filtered(current, "excludingRegex"),
      filtered(previous, "includingRegex"),
      filtered(previous, "excludingRegex"),
    ]);
    expect(raw[8]).toBe(body(previous, ["query"], 1000));
  });

  it("matches on the full text, before cutting it to 200 characters (AC-005)", async () => {
    const long = "busqueda larga ".repeat(20);
    const sameStart = `${long}distinta`;
    const { impl } = google([row(long, 5, 3), row(sameStart, 4, 3)], [row(long, 2, 9)]);
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    const queries = outcome.ok ? outcome.data.queries : [];
    expect(queries[0]!.query).toHaveLength(200);
    expect(queries[0]!.previous?.position).toBe(9);
    expect(queries[1]!.previous).toBeNull();
  });

  it("keeps 25 rows out of 30 and finds their match among 1000 previous rows (AC-001)", async () => {
    const now = Array.from({ length: 30 }, (_, i) => row(`busqueda ${i}`, 30 - i, 5));
    const before = Array.from({ length: 1000 }, (_, i) => row(`anterior ${i}`, 1, 20));
    before[999] = row("busqueda 24", 1, 9);
    const { impl } = google(now, before);
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    const queries = outcome.ok ? outcome.data.queries : [];
    expect(queries).toHaveLength(25);
    expect(queries[24]!.previous?.position).toBe(9);
    expect(queries[0]!.previous).toBeNull();
  });

  it("treats hostile query texts as plain Map keys", async () => {
    const { impl } = google([row("__proto__", 5, 8), row("constructor", 4, 8), row("toString", 3, 8)], [row("__proto__", 2, 12)]);
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    const queries = outcome.ok ? outcome.data.queries : [];
    expect(queries[0]!.previous?.position).toBe(12);
    expect(queries[1]!.previous).toBeNull();
    expect(queries[2]!.previous).toBeNull();
  });

  it("does not match texts that differ only in case or spacing (AC-005)", async () => {
    const { impl } = google([row("crm agencias", 5, 8)], [row("CRM Agencias", 2, 12), row("crm  agencias", 2, 11)]);
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome.ok && outcome.data.queries[0]!.previous).toBeNull();
  });

  it("uses the first row when a text repeats, and null for all without previous rows", async () => {
    const repeated = google([row("crm", 5, 8)], [row("crm", 3, 10), row("crm", 1, 40)]);
    const first = await collectSearchConsole(account, site, { fetchImpl: repeated.impl, now: NOW });
    expect(first.ok && first.data.queries[0]!.previous?.position).toBe(10);
    const none = google([row("crm", 5, 8)], []);
    const empty = await collectSearchConsole(account, site, { fetchImpl: none.impl, now: NOW });
    expect(empty.ok && empty.data.queries[0]!.previous).toBeNull();
  });

  it("fails the capture on a malformed answer or a timeout of the new query (AC-007)", async () => {
    const malformed = google([row("crm", 5, 8)], Response.json({ rows: [{ keys: ["crm"], clicks: -1, impressions: 1, ctr: 0, position: 1 }] }));
    expect(await collectSearchConsole(account, site, { fetchImpl: malformed.impl, now: NOW })).toMatchObject({ ok: false, kind: "error" });
    const inner = google([], []).impl;
    const slow = (async (input: string, init?: RequestInit) => {
      if (String(init?.body ?? "").includes('"startDate":"2026-08-30","endDate":"2026-09-26","dimensions":["query"]')) {
        return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
      }
      return inner(input, init);
    }) as typeof fetch;
    expect(await collectSearchConsole(account, site, { fetchImpl: slow, timeoutMs: 20, now: NOW })).toMatchObject({ ok: false, kind: "error", message: "Search Console no respondió a tiempo" });
  });

  it.each([
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "api_disabled"],
    [403, { error: { message: "User does not have sufficient permission for site." } }, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("fails the whole capture when the previous queries answer %i (AC-007)", async (status, body, kind) => {
    const { calls, impl } = google([row("crm", 5, 8)], Response.json(body, { status }));
    const outcome = await collectSearchConsole(account, site, { fetchImpl: impl, now: NOW });
    expect(outcome).toMatchObject({ ok: false, kind, property: "sc-domain:olessium.com" });
    expect(outcome).not.toHaveProperty("data");
    const jwt = new URLSearchParams(calls[0]!.body).get("assertion")!;
    const text = JSON.stringify(outcome);
    for (const secret of [SECRET, jwt, PRIVATE_PEM.split("\n")[1]!]) expect(text).not.toContain(secret);
  });
});

describe("tracked keyword capture", () => {
  function provider(keywordResponse: unknown, status = 200) {
    const bodies: string[] = [];
    let calls = 0;
    const fetcher = (async (input: string, init?: RequestInit) => {
      calls++;
      if (String(input).includes("oauth2.googleapis.com")) return Response.json({access_token:"token"});
      if (String(input).endsWith("/sites")) return Response.json({siteEntry:[{siteUrl:"sc-domain:olessium.com",permissionLevel:"siteOwner"}]});
      const body = String(init?.body); bodies.push(body);
      if (JSON.parse(body).dimensions.includes("date")) return Response.json(keywordResponse,{status});
      return Response.json({rows:[]});
    }) as typeof fetch;
    return {fetcher,bodies,get calls(){return calls;}};
  }
  it("keeps previous nine serialized requests and adds one date/query request", async () => {
    const plain = provider({}); const tracked = provider({rows:[{keys:["2026-10-24","CRM"],clicks:1,impressions:5,ctr:.2,position:8}]});
    const a = await collectSearchConsole(account,site,{fetchImpl:plain.fetcher,now:NOW});
    const b = await collectSearchConsole(account,{...site,trackedKeywords:["crm"]},{fetchImpl:tracked.fetcher,now:NOW});
    expect(a.ok).toBe(true); expect(b.ok).toBe(true);
    expect(tracked.bodies.slice(0,9)).toEqual(plain.bodies);
    expect(plain.calls).toBe(11); expect(tracked.calls).toBe(12);
    expect(JSON.parse(tracked.bodies[9]!)).toEqual({startDate:"2026-04-26",endDate:"2026-10-24",dimensions:["date","query"],rowLimit:25000,type:"web",dataState:"final",dimensionFilterGroups:[{groupType:"and",filters:[{dimension:"query",operator:"includingRegex",expression:"(?i)^(?:crm)$"}]}]});
    if(a.ok) expect(a.data.keywordSeries.keywords).toEqual([]);
    if(b.ok) expect(b.data.keywordSeries.keywords[0]!.weeks[0]).toMatchObject({position:8,daysWithData:1,impressions:5});
  });
  it.each([
    [403,{error:{message:"secret upstream",details:[{reason:"SERVICE_DISABLED"}]}},"api_disabled"],
    [403,{error:{message:"secret upstream",status:"PERMISSION_DENIED"}},"no_access"],
    [429,{error:{message:"secret upstream"}},"quota_exceeded"],
    [500,{error:{message:"secret upstream"}},"error"],
  ])("fails the entire capture for keyword HTTP %s", async(status,body,kind)=>{
    const p=provider(body,status);
    const result=await collectSearchConsole(account,{...site,trackedKeywords:["crm"]},{fetchImpl:p.fetcher,now:NOW});
    expect(result).toMatchObject({ok:false,kind}); expect(JSON.stringify(result)).not.toContain("secret upstream");
  });
  it("keeps a day where Google reports more clicks than impressions",async()=>{
    const p=provider({rows:[{keys:["2026-10-24","crm"],clicks:3,impressions:2,ctr:1.5,position:8}]});
    const result=await collectSearchConsole(account,{...site,trackedKeywords:["crm"]},{fetchImpl:p.fetcher,now:NOW});
    expect(result.ok).toBe(true);
    if(result.ok) expect(result.data.keywordSeries.keywords[0]!.weeks[0]).toMatchObject({clicks:3,impressions:2});
  });
  it.each([
    ["an impossible date",[{keys:["2026-02-30","crm"],clicks:1,impressions:5,ctr:.2,position:8}],"error"],
    ["a repeated row",Array(2).fill({keys:["2026-10-24","crm"],clicks:1,impressions:5,ctr:.2,position:8}),"error"],
    ["the row limit",Array(25000).fill({keys:["2026-10-24","other"],clicks:1,impressions:5,ctr:.2,position:8}),"keyword_limit"],
  ])("fails with %s in the keyword answer, without a partial series",async(_,rows,kind)=>{
    const result=await collectSearchConsole(account,{...site,trackedKeywords:["crm"]},{fetchImpl:provider({rows}).fetcher,now:NOW});
    expect(result).toMatchObject({ok:false,kind,property:"sc-domain:olessium.com"});
  });
  it("rejects an oversized list before token",async()=>{
    const p=provider({});
    const result=await collectSearchConsole(account,{...site,trackedKeywords:Array.from({length:25},(_,i)=>`${i}${"界".repeat(78)}`)},{fetchImpl:p.fetcher,now:NOW});
    expect(result).toMatchObject({ok:false,kind:"keyword_limit"}); expect(p.calls).toBe(0);
  });
});
