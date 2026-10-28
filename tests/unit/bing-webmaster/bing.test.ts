import { describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  BingError,
  getPageStats,
  getQueryStats,
  getRankAndTrafficStats,
  getUserSites,
  parseBingDate,
  type ClientOptions,
} from "@/modules/bing-webmaster/bing";

const KEY = "EEDECC1EA4AE341CC57365E075EBC8B6";

function respond(status: number, body: unknown) {
  const fetchImpl = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: fetchImpl.mock.calls };
}

async function failure(promise: Promise<unknown>): Promise<BingError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof BingError) return error;
    throw error;
  }
  throw new Error("expected a BingError");
}

describe("parseBingDate", () => {
  it("reads the calendar day at the stated offset", () => {
    // 2011-09-16T07:00Z is midnight of 2011-09-16 at -0700 (Microsoft's own sample).
    expect(parseBingDate("/Date(1316156400000-0700)/")).toBe("2011-09-16");
    // 2026-10-27T23:30Z is already 2026-10-28 at +0100.
    expect(parseBingDate("/Date(1793143800000+0100)/")).toBe("2026-10-28");
    expect(parseBingDate("/Date(1793143800000)/")).toBe("2026-10-27");
  });

  it("rejects anything else", () => {
    for (const value of ["2026-10-28", "/Date(abc)/", "/Date(1316156400000-07)/", "Date(1316156400000)", "", "/Date(253402300800000)/", "/Date(-62198755200001)/"]) {
      expect(parseBingDate(value)).toBeNull();
    }
  });
});

describe("request", () => {
  it("calls the fixed JSON endpoint with the parameters, the key and no redirects", async () => {
    const { fetchImpl, calls } = respond(200, { d: [] });
    await getQueryStats(KEY, "https://olessium.com/", { fetchImpl });
    const [rawUrl, init] = calls[0]!;
    const url = new URL(String(rawUrl));
    expect(`${url.origin}${url.pathname}`).toBe(`${API_BASE}GetQueryStats`);
    expect(url.searchParams.get("siteUrl")).toBe("https://olessium.com/");
    expect(url.searchParams.get("apikey")).toBe(KEY);
    expect(init?.redirect).toBe("error");
    expect(init?.method).toBe("GET");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("cannot be steered by a site URL with query syntax", async () => {
    const { fetchImpl, calls } = respond(200, { d: [] });
    await getPageStats(KEY, "https://x.com/?apikey=evil&a=b#frag", { fetchImpl });
    const url = new URL(String(calls[0]![0]));
    expect(url.searchParams.getAll("apikey")).toEqual([KEY]);
    expect(url.searchParams.get("siteUrl")).toBe("https://x.com/?apikey=evil&a=b#frag");
    expect(url.hash).toBe("");
  });
});

describe("timeout", () => {
  it("aborts a request that takes longer than the limit", async () => {
    const hanging = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    const error = await failure(getUserSites(KEY, { fetchImpl: hanging, timeoutMs: 20 }));
    expect(error.kind).toBe("error");
    expect(error.message).toBe("Bing Webmaster no respondió a tiempo");
  });
});

describe("responses", () => {
  it("maps sites", async () => {
    const { fetchImpl } = respond(200, {
      d: [
        { __type: "Site:#Microsoft.Bing.Webmaster.Api", AuthenticationCode: "X", DnsVerificationCode: "y", IsVerified: true, Url: "https://olessium.com/" },
        { Url: "http://example.com", IsVerified: false },
      ],
    });
    expect(await getUserSites(KEY, { fetchImpl })).toEqual([
      { url: "https://olessium.com/", isVerified: true },
      { url: "http://example.com", isVerified: false },
    ]);
  });

  it("maps daily traffic", async () => {
    const { fetchImpl } = respond(200, { d: [{ __type: "RankAndTrafficStats:#x", Clicks: 15, Date: "/Date(1316156400000-0700)/", Impressions: 100 }] });
    expect(await getRankAndTrafficStats(KEY, "http://example.com", { fetchImpl })).toEqual([{ day: "2011-09-16", clicks: 15, impressions: 100 }]);
  });

  it("maps query and page rows, trims long text and drops positions below 1", async () => {
    const row = (Query: string, AvgImpressionPosition: number) => ({
      AvgClickPosition: 18,
      AvgImpressionPosition,
      Clicks: 15,
      Date: "/Date(1316156400000-0700)/",
      Impressions: 100,
      Query,
    });
    const queries = respond(200, { d: [row("q".repeat(300), 17), row("b", -1), row("c", 0)] });
    expect(await getQueryStats(KEY, "http://example.com", { fetchImpl: queries.fetchImpl })).toEqual([
      { key: "q".repeat(200), day: "2011-09-16", clicks: 15, impressions: 100, position: 17 },
      { key: "b", day: "2011-09-16", clicks: 15, impressions: 100, position: null },
      { key: "c", day: "2011-09-16", clicks: 15, impressions: 100, position: null },
    ]);
    const pages = respond(200, { d: [row(`https://x.com/${"p".repeat(600)}`, 3)] });
    const [page] = await getPageStats(KEY, "http://example.com", { fetchImpl: pages.fetchImpl });
    expect(page!.key).toHaveLength(500);
  });

  it("treats d: null as no rows", async () => {
    const { fetchImpl } = respond(200, { d: null });
    expect(await getUserSites(KEY, { fetchImpl })).toEqual([]);
  });

  it("names the method and the failing field, never the value", async () => {
    const { fetchImpl } = respond(200, { d: [{ Query: null, Clicks: 1, Impressions: 1, Date: "/Date(1316156400000-0700)/" }] });
    const error = await failure(getPageStats(KEY, "http://example.com", { fetchImpl }));
    expect(error.message).toBe("Respuesta de GetPageStats con un formato inesperado en 0.Query");
  });

  it("rejects bodies that are not { d: [...] } or carry invalid numbers or dates", async () => {
    const bad = [
      { status: 200, body: "<html>" },
      { status: 200, body: { result: [] } },
      { status: 200, body: { d: [{ Clicks: -1, Impressions: 1, Date: "/Date(1316156400000-0700)/" }] } },
      { status: 200, body: { d: [{ Clicks: 1, Impressions: 1, Date: "2011-09-16" }] } },
      { status: 200, body: { d: [{ Clicks: 1.5, Impressions: 1, Date: "/Date(1316156400000-0700)/" }] } },
      { status: 200, body: { d: [{ Clicks: 1, Impressions: 1e15, Date: "/Date(1316156400000-0700)/" }] } },
      { status: 200, body: { d: [{ Clicks: 1, Impressions: 1, Date: "/Date(253402300800000)/" }] } },
    ];
    for (const { status, body } of bad) {
      const { fetchImpl } = respond(status, body);
      const error = await failure(getRankAndTrafficStats(KEY, "http://example.com", { fetchImpl }));
      expect(error.kind).toBe("error");
    }
  });
});

describe("errors", () => {
  const codes: [number, string][] = [
    [3, "invalid_credentials"],
    [6, "invalid_credentials"],
    [10, "invalid_credentials"],
    [4, "quota_exceeded"],
    [5, "quota_exceeded"],
    [11, "no_access"],
    [14, "no_access"],
    [1, "error"],
    [7, "error"],
    [16, "error"],
  ];

  async function allFailures(): Promise<BingError[]> {
    const errors: BingError[] = [];
    for (const [code] of codes) {
      const { fetchImpl } = respond(400, { ErrorCode: code, Message: `Bad ${KEY} <script>` });
      errors.push(await failure(getUserSites(KEY, { fetchImpl })));
    }
    for (const [status, body] of [
      [400, "not json"],
      [401, {}],
      [500, { Message: KEY }],
      [503, ""],
    ] as const) {
      const { fetchImpl } = respond(status, body);
      errors.push(await failure(getUserSites(KEY, { fetchImpl })));
    }
    const thrower = (error: Error): ClientOptions => ({ fetchImpl: (async () => Promise.reject(error)) as unknown as typeof fetch });
    const timeout = new DOMException("signal timed out", "TimeoutError");
    errors.push(await failure(getUserSites(KEY, thrower(timeout))));
    errors.push(await failure(getUserSites(KEY, thrower(new TypeError(`fetch failed for ${API_BASE}GetUserSites?apikey=${KEY}`)))));
    return errors;
  }

  it("classifies Bing error codes", async () => {
    const errors = await allFailures();
    expect(errors.slice(0, codes.length).map((e) => e.kind)).toEqual(codes.map(([, kind]) => kind));
    // The numeric code survives in the message (D010), so an invalid key (3) and a blocked account (6) stay apart.
    expect(errors.slice(0, codes.length).map((e) => e.message.match(/\d+\)?$/)?.[0])).toEqual(codes.map(([code, kind]) => (kind === "error" ? `${code}` : `${code})`)));
    expect(errors[0]!.message).toMatch(/\(código 3\)$/);
    expect(errors[1]!.message).toMatch(/\(código 6\)$/);
    expect(errors.slice(codes.length).map((e) => e.kind)).toEqual(["error", "error", "error", "error", "error", "error"]);
  });

  it("never carries the key, the URL or Bing's message", async () => {
    for (const error of await allFailures()) {
      const text = `${error.message} ${JSON.stringify(error)} ${String(error.stack)} ${String((error as { cause?: unknown }).cause ?? "")}`;
      expect(text).not.toContain(KEY);
      expect(text).not.toContain("ssl.bing.com");
      expect(text).not.toContain("<script>");
    }
  });
});
