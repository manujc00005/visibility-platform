import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, MAX_FAILING, mapPageSpeedResponse, runPageSpeed } from "@/modules/audits/pagespeed";

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
      categories: {},
      textLocale: "es",
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
    expect((await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: fakeFetch(500, {}), retryDelayMs: 0 })).status).toBe("error");
    expect((await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: fakeFetch(200, PSI_OK) })).score).toBe(43);
  });

  it("maps a timeout to error without throwing", async () => {
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as typeof fetch;
    const result = await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: hang, timeoutMs: 50 });
    expect(result).toMatchObject({ status: "error", error: "PageSpeed Insights no respondió a tiempo" });
  });
});

describe("Lighthouse categories", () => {
  const audit = (score: number | null, mode = "binary", title = "Comprobación") => ({ score, scoreDisplayMode: mode, title });
  const body = {
    lighthouseResult: {
      lighthouseVersion: "13.5.0",
      categories: {
        performance: { score: 0.86, auditRefs: [] },
        seo: {
          score: 0.83,
          auditRefs: [
            { id: "document-title", weight: 1 },
            { id: "meta-description", weight: 1 },
            { id: "link-text", weight: 1 },
            { id: "crawlable-anchors", weight: 1 },
            { id: "hreflang", weight: 1 },
            { id: "structured-data", weight: 0 },
            { id: "is-crawlable", weight: 4.043 },
          ],
        },
        accessibility: { score: 1, auditRefs: [{ id: "color-contrast", weight: 7 }, { id: "logical-tab-order", weight: 0 }] },
        "best-practices": { score: null, auditRefs: [] },
      },
      audits: {
        "document-title": audit(1),
        "meta-description": audit(0, "binary", "  El documento no tiene una metadescripción  "),
        "link-text": audit(0.5, "numeric", ""),
        "crawlable-anchors": audit(0, "binary", "Los enlaces no se pueden rastrear"),
        hreflang: audit(null, "notApplicable"),
        "structured-data": audit(null, "manual"),
        "is-crawlable": audit(0, "binary", "La página no se puede indexar"),
        "color-contrast": audit(1),
        "logical-tab-order": audit(null, "manual"),
      },
    },
  };

  it("scores each category and lists the failing checks, heaviest first", () => {
    const { categories } = mapPageSpeedResponse(body);
    // Not applicable and manual checks do not count; equal weights go by id.
    expect(categories?.seo).toEqual({
      score: 83,
      scored: 5,
      failingTotal: 4,
      failing: [
        { id: "is-crawlable", title: "La página no se puede indexar", score: 0 },
        { id: "crawlable-anchors", title: "Los enlaces no se pueden rastrear", score: 0 },
        { id: "link-text", title: "link-text", score: 50 },
        { id: "meta-description", title: "El documento no tiene una metadescripción", score: 0 },
      ],
    });
  });

  it("counts numeric checks below the pass mark and names untitled checks by id", () => {
    const seo = mapPageSpeedResponse({
      lighthouseResult: { categories: { seo: { score: 0.5, auditRefs: [{ id: "link-text", weight: 1 }] } }, audits: { "link-text": audit(0.5, "numeric", "") } },
    }).categories?.seo;
    expect(seo?.failing).toEqual([{ id: "link-text", title: "link-text", score: 50 }]);
  });

  it("keeps a perfect category without failures and an unscored one as null", () => {
    const { categories } = mapPageSpeedResponse(body);
    expect(categories?.accessibility).toEqual({ score: 100, scored: 1, failingTotal: 0, failing: [] });
    expect(categories?.["best-practices"]).toEqual({ score: null, scored: 0, failingTotal: 0, failing: [] });
  });

  it("caps the stored list but keeps the real total", () => {
    const refs = Array.from({ length: MAX_FAILING + 5 }, (_, i) => ({ id: `check-${String(i).padStart(2, "0")}`, weight: 1 }));
    const audits = Object.fromEntries(refs.map((r) => [r.id, audit(0, "binary", `Fallo ${r.id}`)]));
    const seo = mapPageSpeedResponse({ lighthouseResult: { categories: { seo: { score: 0.1, auditRefs: refs } }, audits } }).categories?.seo;
    expect(seo?.failingTotal).toBe(MAX_FAILING + 5);
    expect(seo?.failing).toHaveLength(MAX_FAILING);
  });

  const one = (entries: [string, number, ReturnType<typeof audit>][], score = 0.5) =>
    mapPageSpeedResponse({
      lighthouseResult: {
        categories: { seo: { score, auditRefs: entries.map(([id, weight]) => ({ id, weight })) } },
        audits: Object.fromEntries(entries.map(([id, , value]) => [id, value])),
      },
    }).categories?.seo;

  it("keeps the heaviest checks when the list is capped", () => {
    const light = Array.from({ length: MAX_FAILING }, (_, i): [string, number, ReturnType<typeof audit>] => [`light-${String(i).padStart(2, "0")}`, 1, audit(0)]);
    const seo = one([...light, ["heavy", 9, audit(0)]]);
    expect(seo?.failing[0]?.id).toBe("heavy");
    expect(seo?.failing.map((c) => c.id)).not.toContain("light-14");
  });

  it("fails below the pass mark of 0.9 and passes at it", () => {
    const seo = one([["below", 1, audit(0.89, "numeric")], ["at-mark", 1, audit(0.9, "numeric")]]);
    expect(seo).toMatchObject({ scored: 2, failingTotal: 1 });
    expect(seo?.failing.map((c) => c.id)).toEqual(["below"]);
  });

  it("counts only scored modes, whatever score the check carries", () => {
    const seo = one([
      ["informative", 1, audit(0, "informative")],
      ["not-applicable", 1, audit(0, "notApplicable")],
      ["manual", 1, audit(0, "manual")],
      ["savings", 1, audit(0.2, "metricSavings")],
    ]);
    expect(seo).toMatchObject({ scored: 1, failingTotal: 1 });
    expect(seo?.failing.map((c) => c.id)).toEqual(["savings"]);
  });

  it("ignores checks without weight, which do not move the score", () => {
    expect(one([["hidden", 0, audit(0)], ["visible", 1, audit(1)]], 1)).toEqual({ score: 100, scored: 1, failingTotal: 0, failing: [] });
  });

  it("counts a repeated check once and drops ids that are not Lighthouse ids", () => {
    const seo = mapPageSpeedResponse({
      lighthouseResult: {
        categories: { seo: { score: 0.5, auditRefs: [{ id: "twice", weight: 1 }, { id: "twice", weight: 1 }, { id: "x".repeat(101), weight: 1 }, { id: "__proto__", weight: 1 }, { id: "a\u0000b", weight: 1 }] } },
        audits: { twice: audit(0), ["x".repeat(101)]: audit(0), "a\u0000b": audit(0) },
      },
    }).categories?.seo;
    expect(seo).toMatchObject({ scored: 1, failingTotal: 1 });
  });

  it.each([[5], [-0.5], [NaN], [Infinity]])("does not paint an impossible category score: %s", (score) => {
    expect(one([["a", 1, audit(1)]], score)?.score).toBeNull();
  });

  it.each([
    ["an emoji split by the limit", `${"a".repeat(199)}😀`],
    ["a NUL", "a\u0000b"],
    ["a lone surrogate", "a\ud83db"],
  ])("stores titles Postgres accepts with %s", (_, title) => {
    const stored = JSON.stringify(one([["check", 1, audit(0, "binary", title)]]));
    expect(stored).not.toMatch(/\\ud8|\\u0000/);
    expect(one([["check", 1, audit(0, "binary", title)]])?.failing[0]!.title.length).toBeLessThanOrEqual(200);
  });

  it("asks for every category in one Spanish run", async () => {
    let requested = "";
    const impl = (async (input: string) => {
      requested = String(input);
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    await runPageSpeed("https://olessium.com/es", { apiKey: "k", fetchImpl: impl });
    const query = new URL(requested).searchParams;
    expect(query.getAll("category")).toEqual(["performance", "seo", "accessibility", "best-practices"]);
    expect(query.get("locale")).toBe("es");
    expect(query.get("strategy")).toBe("mobile");
  });
});

describe("PageSpeed retry", () => {
  /** Answers with the given statuses in order and counts the calls. */
  function sequence(statuses: number[]) {
    let calls = 0;
    const impl = (async () => {
      const status = statuses[Math.min(calls, statuses.length - 1)]!;
      calls++;
      return new Response(JSON.stringify(status === 200 ? PSI_OK : {}), { status });
    }) as typeof fetch;
    return { impl, calls: () => calls };
  }

  it("repeats once after a 5xx and keeps the good second answer", async () => {
    const google = sequence([500, 200]);
    const result = await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: google.impl, retryDelayMs: 0 });
    expect(result).toMatchObject({ status: "ok", score: 43 });
    expect(google.calls()).toBe(2);
  });

  it("gives up after the second 5xx with the last status", async () => {
    const google = sequence([503, 502]);
    const result = await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: google.impl, retryDelayMs: 0 });
    expect(result).toMatchObject({ status: "error", error: "PageSpeed Insights respondió 502" });
    expect(google.calls()).toBe(MAX_ATTEMPTS);
  });

  it("does not repeat quota, client errors or a first good answer", async () => {
    for (const [status, expected] of [[429, "quota_exceeded"], [400, "error"], [200, "ok"]] as const) {
      const google = sequence([status, 200]);
      expect((await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: google.impl, retryDelayMs: 0 })).status).toBe(expected);
      expect(google.calls()).toBe(1);
    }
  });

  it("does not repeat a 5xx followed by quota", async () => {
    const google = sequence([500, 429]);
    expect(await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: google.impl, retryDelayMs: 0 })).toMatchObject({ status: "quota_exceeded" });
    expect(google.calls()).toBe(2);
  });

  it("shares one deadline between both attempts", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const impl = ((_: unknown, init?: RequestInit) => {
      signals.push(init?.signal);
      return signals.length === 1
        ? Promise.resolve(new Response("{}", { status: 500 }))
        : new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }) as typeof fetch;
    const started = Date.now();
    const result = await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: impl, timeoutMs: 80, retryDelayMs: 40 });
    expect(result).toMatchObject({ status: "error", error: "PageSpeed Insights no respondió a tiempo" });
    expect(signals[0]).toBe(signals[1]);
    expect(Date.now() - started).toBeLessThan(150);
  });

  it("cancels the discarded body before repeating", async () => {
    let cancelled = false;
    let calls = 0;
    const impl = (async () => {
      calls++;
      if (calls > 1) return new Response(JSON.stringify(PSI_OK), { status: 200 });
      return new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { status: 500 });
    }) as typeof fetch;
    await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: impl, retryDelayMs: 0 });
    expect(cancelled).toBe(true);
  });

  it("does not repeat network errors", async () => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const result = await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: impl, retryDelayMs: 0 });
    expect(result).toMatchObject({ status: "error", error: "No se pudo consultar PageSpeed Insights" });
    expect(calls).toBe(1);
  });

  it("waits before repeating", async () => {
    const google = sequence([500, 200]);
    const started = Date.now();
    await runPageSpeed("https://e.es/", { apiKey: "k", fetchImpl: google.impl, retryDelayMs: 60 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });
});
