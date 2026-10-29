import { describe, expect, it } from "vitest";
import { ADMIN_BASE, DATA_BASE, Ga4Error, listKeyEvents, listPropertySummaries, listWebStreamHosts, runReport, type ClientOptions, type ReportRequest } from "@/modules/analytics/ga4";
import { scripted } from "../search-console/fixtures";

const TOKEN = "ya29.secret-token-value";

async function failure(promise: Promise<unknown>): Promise<Ga4Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Ga4Error) return error;
    throw error;
  }
  throw new Error("expected a Ga4Error");
}

const respond = (status: number, body: unknown) => scripted([{ match: () => true, status, body }]);

const REQUEST: ReportRequest = {
  dateRanges: [
    { name: "current", startDate: "2026-09-29", endDate: "2026-10-26" },
    { name: "previous", startDate: "2026-09-01", endDate: "2026-09-28" },
  ],
  dimensions: ["dateRange"],
  metrics: ["activeUsers", "sessions"],
  limit: 10,
};

const disabled = { error: { code: 403, status: "PERMISSION_DENIED", message: "API has not been used in project 1 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } };
const denied = { error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permissions for this property." } };

describe("listPropertySummaries", () => {
  it("flattens properties across accounts with the bearer token and says if there are more", async () => {
    const { calls, impl } = respond(200, {
      accountSummaries: [
        { propertySummaries: [{ property: "properties/123", displayName: "Olessium" }] },
        { propertySummaries: [{ property: "properties/45" }] },
        {},
      ],
      nextPageToken: "next",
    });
    await expect(listPropertySummaries(TOKEN, { fetchImpl: impl })).resolves.toEqual({
      properties: [
        { property: "properties/123", displayName: "Olessium" },
        { property: "properties/45", displayName: "" },
      ],
      more: true,
    });
    expect(calls[0]!.url).toBe(`${ADMIN_BASE}/accountSummaries?pageSize=200`);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("rejects a property name that is not properties/<digits>", async () => {
    const { impl } = respond(200, { accountSummaries: [{ propertySummaries: [{ property: "properties/../x" }] }] });
    const error = await failure(listPropertySummaries(TOKEN, { fetchImpl: impl }));
    expect(error.message).toBe("Respuesta de accountSummaries con un formato inesperado en accountSummaries.0.propertySummaries.0.property");
  });
});

describe("listWebStreamHosts", () => {
  it("keeps the hosts of web streams only, lowercased and without path", async () => {
    const { calls, impl } = respond(200, {
      dataStreams: [
        { type: "WEB_DATA_STREAM", webStreamData: { defaultUri: "https://Olessium.com/es" } },
        { type: "WEB_DATA_STREAM", webStreamData: { defaultUri: "www.olessium.com" } },
        { type: "WEB_DATA_STREAM", webStreamData: { defaultUri: "https://olessium.com" } },
        { type: "ANDROID_APP_DATA_STREAM" },
        { type: "WEB_DATA_STREAM", webStreamData: {} },
      ],
    });
    await expect(listWebStreamHosts(TOKEN, "properties/123", { fetchImpl: impl })).resolves.toEqual(["olessium.com", "www.olessium.com"]);
    expect(calls[0]!.url).toBe(`${ADMIN_BASE}/properties/123/dataStreams?pageSize=200`);
  });

  it("refuses a malformed property before calling", async () => {
    const { calls, impl } = respond(200, {});
    expect((await failure(listWebStreamHosts(TOKEN, "properties/1/../2", { fetchImpl: impl }))).kind).toBe("error");
    expect(calls).toHaveLength(0);
  });
});

describe("runReport", () => {
  it("posts named ranges and reads values by header name, not position", async () => {
    const { calls, impl } = respond(200, {
      dimensionHeaders: [{ name: "dateRange" }],
      metricHeaders: [{ name: "sessions" }, { name: "activeUsers" }],
      rows: [{ dimensionValues: [{ value: "current" }], metricValues: [{ value: "120" }, { value: "80" }] }],
      metadata: { subjectToThresholding: true },
    });
    const result = await runReport(TOKEN, "properties/123", { ...REQUEST, orderBy: "sessions" }, { fetchImpl: impl });
    expect(result.rows).toEqual([{ dimensions: { dateRange: "current" }, metrics: { activeUsers: 80, sessions: 120 } }]);
    expect(result.quality).toEqual({ otherRow: false, thresholded: true, sampled: false });
    expect(calls[0]!.url).toBe(`${DATA_BASE}/properties/123:runReport`);
    expect(calls[0]!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.body)).toEqual({
      dateRanges: REQUEST.dateRanges,
      // Not sent: the real API answers 400 to "dateRange" as a dimension and adds the column on its own (D010).
      dimensions: [],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "10",
    });
  });

  it("returns no rows for an empty report and flags other-row and sampling", async () => {
    const { impl } = respond(200, { metadata: { dataLossFromOtherRow: true, samplingMetadatas: [{ samplesReadCount: "1" }] } });
    await expect(runReport(TOKEN, "properties/123", REQUEST, { fetchImpl: impl })).resolves.toEqual({
      rows: [],
      quality: { otherRow: true, thresholded: false, sampled: true },
    });
  });

  it("rejects rows without a requested metric or with a non-integer value", async () => {
    const missing = respond(200, { dimensionHeaders: [{ name: "dateRange" }], metricHeaders: [{ name: "sessions" }], rows: [{ dimensionValues: [{ value: "current" }], metricValues: [{ value: "1" }] }] });
    expect((await failure(runReport(TOKEN, "properties/123", REQUEST, { fetchImpl: missing.impl }))).message).toBe("Respuesta de runReport sin la métrica activeUsers");
    for (const value of ["1.5", "-1", "1e3", "", "99999999999999"]) {
      const bad = respond(200, {
        dimensionHeaders: [{ name: "dateRange" }],
        metricHeaders: [{ name: "activeUsers" }, { name: "sessions" }],
        rows: [{ dimensionValues: [{ value: "current" }], metricValues: [{ value }, { value: "1" }] }],
      });
      expect((await failure(runReport(TOKEN, "properties/123", REQUEST, { fetchImpl: bad.impl }))).message).toBe("Respuesta de runReport con un valor no entero en activeUsers");
    }
  });
});

describe("errors", () => {
  async function allFailures(): Promise<[Ga4Error, string][]> {
    const out: [Ga4Error, string][] = [];
    const admin = async (status: number, body: unknown) => failure(listPropertySummaries(TOKEN, { fetchImpl: respond(status, body).impl }));
    const data = async (status: number, body: unknown) => failure(runReport(TOKEN, "properties/1", REQUEST, { fetchImpl: respond(status, body).impl }));
    out.push([await admin(401, { error: { message: TOKEN } }), "invalid_credentials"]);
    out.push([await admin(403, disabled), "admin_api_disabled"]);
    out.push([await data(403, disabled), "data_api_disabled"]);
    out.push([await data(403, { error: { errors: [{ reason: "accessNotConfigured" }] } }), "data_api_disabled"]);
    out.push([await admin(403, denied), "no_access"]);
    out.push([await data(403, denied), "no_access"]);
    out.push([await data(429, { error: { status: "RESOURCE_EXHAUSTED", message: TOKEN } }), "quota_exceeded"]);
    out.push([await data(500, { error: { message: TOKEN } }), "error"]);
    out.push([await admin(400, { error: { message: `bad ${TOKEN}` } }), "error"]);
    const notJson = (async () => new Response(`<html>${TOKEN}</html>`, { status: 200 })) as unknown as typeof fetch;
    out.push([await failure(listPropertySummaries(TOKEN, { fetchImpl: notJson })), "error"]);
    const thrower = (error: Error): ClientOptions => ({ fetchImpl: (async () => Promise.reject(error)) as unknown as typeof fetch });
    out.push([await failure(runReport(TOKEN, "properties/1", REQUEST, thrower(new DOMException("signal timed out", "TimeoutError")))), "error"]);
    out.push([await failure(runReport(TOKEN, "properties/1", REQUEST, thrower(new TypeError(`fetch failed Bearer ${TOKEN}`)))), "error"]);
    return out;
  }

  it("classifies each failure", async () => {
    for (const [error, kind] of await allFailures()) expect(error.kind).toBe(kind);
  });

  it("names the API that is disabled and says when time ran out", async () => {
    const failures = await allFailures();
    expect(failures[1]![0].message).toBe("Google Analytics Admin API no está activada en el proyecto de Google Cloud de la cuenta de servicio");
    expect(failures[2]![0].message).toBe("Google Analytics Data API no está activada en el proyecto de Google Cloud de la cuenta de servicio");
    expect(failures[10]![0].message).toBe("Google Analytics Data API no respondió a tiempo");
  });

  it("never carries the token, the URL or Google's message", async () => {
    for (const [error] of await allFailures()) {
      const text = `${error.message} ${JSON.stringify(error)} ${String(error.stack)} ${String((error as { cause?: unknown }).cause ?? "")}`;
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("googleapis.com");
      expect(text).not.toContain("sufficient permissions");
    }
  });

  it("aborts a call that takes too long", async () => {
    const slow = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    expect((await failure(listPropertySummaries(TOKEN, { fetchImpl: slow, timeoutMs: 5 }))).message).toBe("Google Analytics Admin API no respondió a tiempo");
  });
});

describe("listKeyEvents (feature 008)", () => {
  const events = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `properties/1/keyEvents/${i}`, eventName: `evento_${i}` }));

  it("asks for one page of 200 with the bearer token and keeps the order", async () => {
    const { calls, impl } = respond(200, { keyEvents: [{ eventName: "generate_lead" }, { eventName: "purchase" }, { eventName: "form_submit" }] });
    await expect(listKeyEvents(TOKEN, "properties/123", { fetchImpl: impl })).resolves.toEqual({ events: ["generate_lead", "purchase", "form_submit"], more: false });
    expect(calls[0]!.url).toBe(`${ADMIN_BASE}/properties/123/keyEvents?pageSize=200`);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("reads a missing list as no key events, not as an error", async () => {
    await expect(listKeyEvents(TOKEN, "properties/1", { fetchImpl: respond(200, {}).impl })).resolves.toEqual({ events: [], more: false });
  });

  it("keeps 50 names and says there are more, also when GA4 has another page", async () => {
    const many = await listKeyEvents(TOKEN, "properties/1", { fetchImpl: respond(200, { keyEvents: events(60) }).impl });
    expect(many.events).toHaveLength(50);
    expect(many.events[49]).toBe("evento_49");
    expect(many.more).toBe(true);
    const paged = await listKeyEvents(TOKEN, "properties/1", { fetchImpl: respond(200, { keyEvents: events(3), nextPageToken: "x" }).impl });
    expect(paged).toEqual({ events: ["evento_0", "evento_1", "evento_2"], more: true });
  });

  it("cuts names to 100 characters", async () => {
    const result = await listKeyEvents(TOKEN, "properties/1", { fetchImpl: respond(200, { keyEvents: [{ eventName: "x".repeat(150) }] }).impl });
    expect(result.events[0]).toHaveLength(100);
  });

  it("rejects an entry without an event name instead of inventing one", async () => {
    for (const keyEvents of [[{ name: "properties/1/keyEvents/9" }], [{ eventName: "" }], [{ eventName: 7 }]]) {
      expect((await failure(listKeyEvents(TOKEN, "properties/1", { fetchImpl: respond(200, { keyEvents }).impl }))).kind).toBe("error");
    }
  });

  it("refuses a malformed property before calling", async () => {
    const { calls, impl } = respond(200, {});
    expect((await failure(listKeyEvents(TOKEN, "properties/../x", { fetchImpl: impl }))).kind).toBe("error");
    expect(calls).toHaveLength(0);
  });

  it.each([
    [401, { error: { message: TOKEN } }, "invalid_credentials"],
    [403, disabled, "admin_api_disabled"],
    [403, denied, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("maps HTTP %i to %s without the token", async (status, body, kind) => {
    const error = await failure(listKeyEvents(TOKEN, "properties/1", { fetchImpl: respond(status, body).impl }));
    expect(error.kind).toBe(kind);
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(TOKEN);
  });
});

describe("runReport dimension filter (feature 008)", () => {
  const filter = { filter: { fieldName: "sessionDefaultChannelGroup" as const, stringFilter: { matchType: "EXACT" as const, value: "Organic Search", caseSensitive: true as const } } };

  it("sends the filter only when given and leaves the previous body unchanged", async () => {
    const { calls, impl } = scripted([
      { match: () => true, status: 200, body: {} },
      { match: () => true, status: 200, body: {} },
    ]);
    await runReport(TOKEN, "properties/1", { ...REQUEST, dimensionFilter: filter }, { fetchImpl: impl });
    await runReport(TOKEN, "properties/1", REQUEST, { fetchImpl: impl });
    const withFilter = JSON.parse(calls[0]!.body);
    const without = JSON.parse(calls[1]!.body);
    expect(withFilter.dimensionFilter).toEqual(filter);
    expect(without).not.toHaveProperty("dimensionFilter");
    delete withFilter.dimensionFilter;
    expect(withFilter).toEqual(without);
  });
});
