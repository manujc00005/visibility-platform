import { describe, expect, it } from "vitest";
import { mapPageSpeedResponse, runPageSpeed } from "@/modules/audits/pagespeed";

// Shape of a PSI v5 response (lighthouseResult.categories / audits[].numericValue).
const PSI_OK = {
  lighthouseResult: {
    lighthouseVersion: "12.8.2",
    categories: { performance: { score: 0.43 } },
    audits: {
      "largest-contentful-paint": { numericValue: 4810.2 },
      "cumulative-layout-shift": { numericValue: 0.031 },
      "total-blocking-time": { numericValue: 720 },
      "first-contentful-paint": { numericValue: 2200 },
      "speed-index": { numericValue: 5100 },
    },
  },
};

const fakeFetch = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;

describe("PageSpeed Insights", () => {
  it("maps lab metrics and the 0-100 score", () => {
    expect(mapPageSpeedResponse(PSI_OK)).toEqual({
      status: "ok",
      strategy: "mobile",
      score: 43,
      metrics: { lcpMs: 4810.2, cls: 0.031, tbtMs: 720, fcpMs: 2200, speedIndexMs: 5100 },
      lighthouseVersion: "12.8.2",
      error: null,
    });
  });

  it("keeps missing metrics as null instead of zero", () => {
    const result = mapPageSpeedResponse({ lighthouseResult: { audits: {}, categories: {} } });
    expect(result.score).toBeNull();
    expect(result.metrics).toEqual({ lcpMs: null, cls: null, tbtMs: null, fcpMs: null, speedIndexMs: null });
  });

  it("reports Lighthouse runtime errors", () => {
    expect(mapPageSpeedResponse({ lighthouseResult: { runtimeError: { code: "FAILED_DOCUMENT_REQUEST" } } })).toMatchObject({
      status: "error",
      error: "Lighthouse: FAILED_DOCUMENT_REQUEST",
    });
  });

  it("is not_configured without an API key and makes no request", async () => {
    let called = false;
    const result = await runPageSpeed("https://e.es/", {
      apiKey: undefined,
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as typeof fetch,
    });
    expect(result.status).toBe("not_configured");
    expect(called).toBe(false);
  });

  it("maps 429 to quota_exceeded and other errors to error", async () => {
    expect((await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: fakeFetch(429, {}) })).status).toBe("quota_exceeded");
    expect((await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: fakeFetch(500, {}) })).status).toBe("error");
    expect((await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: fakeFetch(200, PSI_OK) })).score).toBe(43);
  });

  it("maps a timeout to error without throwing", async () => {
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    const result = await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: hang, timeoutMs: 50 });
    expect(result).toMatchObject({ status: "error", error: "PageSpeed Insights no respondió a tiempo" });
  });
});
