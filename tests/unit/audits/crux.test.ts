import { describe, expect, it } from "vitest";
import { mapCruxResponse, rateFieldMetric, runCrux } from "@/modules/audits/crux";

const RECORD = {
  record: {
    key: { formFactor: "PHONE", url: "https://e.es/" },
    metrics: {
      largest_contentful_paint: { percentiles: { p75: 3120 } },
      interaction_to_next_paint: { percentiles: { p75: 180 } },
      cumulative_layout_shift: { percentiles: { p75: "0.05" } },
      first_contentful_paint: { percentiles: { p75: 1900 } },
      experimental_time_to_first_byte: { percentiles: { p75: 950 } },
    },
    collectionPeriod: { firstDate: { year: 2026, month: 9, day: 27 }, lastDate: { year: 2026, month: 10, day: 24 } },
  },
};

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function scripted(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const next = responses.shift() ?? { status: 500 };
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  }) as typeof fetch;
  return { calls, impl };
}

describe("rateFieldMetric", () => {
  it("applies the Core Web Vitals thresholds inclusively for good", () => {
    expect(rateFieldMetric("lcp", 2500)).toBe("good");
    expect(rateFieldMetric("lcp", 2501)).toBe("needs_improvement");
    expect(rateFieldMetric("lcp", 4001)).toBe("poor");
    expect(rateFieldMetric("inp", 200)).toBe("good");
    expect(rateFieldMetric("inp", 501)).toBe("poor");
    expect(rateFieldMetric("cls", 0.1)).toBe("good");
    expect(rateFieldMetric("cls", 0.25)).toBe("needs_improvement");
  });
});

describe("mapCruxResponse", () => {
  it("reads p75 values, CLS as a string and the collection period", () => {
    expect(mapCruxResponse(RECORD, "url", "https://e.es/")).toEqual({
      status: "ok",
      formFactor: "PHONE",
      scope: "url",
      key: "https://e.es/",
      collectionPeriod: { firstDate: "2026-09-27", lastDate: "2026-10-24" },
      metrics: { lcpMs: 3120, inpMs: 180, cls: 0.05, fcpMs: 1900, ttfbMs: 950 },
      error: null,
    });
  });

  it("treats a record without usable metrics as no data and garbage as null", () => {
    expect(mapCruxResponse({ record: { metrics: {} } }, "url", "https://e.es/").status).toBe("no_data");
    const odd = mapCruxResponse(
      { record: { metrics: { largest_contentful_paint: { percentiles: { p75: "abc" } }, cumulative_layout_shift: { percentiles: { p75: -1 } }, interaction_to_next_paint: { percentiles: { p75: 90 } } } } },
      "origin",
      "https://e.es",
    );
    expect(odd.metrics).toMatchObject({ lcpMs: null, cls: null, inpMs: 90 });
    expect(odd.collectionPeriod).toBeNull();
    expect(mapCruxResponse({}, "url", "x").status).toBe("error");
  });
});

describe("runCrux", () => {
  it("is not_configured without a key and makes no request", async () => {
    const { calls, impl } = scripted([]);
    expect((await runCrux("https://e.es/", { apiKey: undefined, fetchImpl: impl })).status).toBe("not_configured");
    expect(calls).toEqual([]);
  });

  it("queries the page on phones and uses its record when it exists", async () => {
    const { calls, impl } = scripted([{ status: 200, body: RECORD }]);
    const result = await runCrux("https://e.es/", { apiKey: "k", fetchImpl: impl });
    expect(result).toMatchObject({ status: "ok", scope: "url" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("chromeuxreport.googleapis.com/v1/records:queryRecord?key=k");
    expect(calls[0]!.body).toMatchObject({ url: "https://e.es/", formFactor: "PHONE" });
  });

  it("falls back to the origin when the page has no data", async () => {
    const { calls, impl } = scripted([{ status: 404 }, { status: 200, body: RECORD }]);
    const result = await runCrux("https://www.e.es/servicios?x=1", { apiKey: "k", fetchImpl: impl });
    expect(result).toMatchObject({ status: "ok", scope: "origin", key: "https://www.e.es" });
    expect(calls[1]!.body).toEqual(expect.objectContaining({ origin: "https://www.e.es", formFactor: "PHONE" }));
    expect(calls[1]!.body).not.toHaveProperty("url");
  });

  it("reports no_data when neither the page nor the origin has data", async () => {
    const { impl } = scripted([{ status: 404 }, { status: 404 }]);
    expect(await runCrux("https://e.es/", { apiKey: "k", fetchImpl: impl })).toMatchObject({ status: "no_data", metrics: null });
  });

  it("maps quota, disabled API and other errors without trying the origin", async () => {
    const quota = scripted([{ status: 429 }]);
    expect((await runCrux("https://e.es/", { apiKey: "k", fetchImpl: quota.impl })).status).toBe("quota_exceeded");
    expect(quota.calls).toHaveLength(1);
    const forbidden = scripted([{ status: 403 }]);
    expect(await runCrux("https://e.es/", { apiKey: "k", fetchImpl: forbidden.impl })).toMatchObject({
      status: "error",
      error: "La clave no tiene habilitada la API Chrome UX Report",
    });
    const broken = scripted([{ status: 404 }, { status: 500 }]);
    expect((await runCrux("https://e.es/", { apiKey: "k", fetchImpl: broken.impl })).status).toBe("error");
  });

  it("maps a timeout to error without throwing", async () => {
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    expect(await runCrux("https://e.es/", { apiKey: "k", fetchImpl: hang, timeoutMs: 50 })).toMatchObject({
      status: "error",
      error: "La API de CrUX no respondió a tiempo",
    });
  });
});
