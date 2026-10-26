/**
 * Real-user experience from the Chrome UX Report (CrUX) API: 75th percentile over the last
 * 28 days of Chrome users on phones. Free (150 queries/min per Google Cloud project) and
 * keyed; the key must have the "Chrome UX Report API" enabled.
 *
 * Small-business pages often lack page-level data, so the page is queried first and the
 * whole origin second; the result says which one was used. "No data" is a normal outcome
 * (too few visits), not an error. Like PageSpeed, the request goes to Google's fixed
 * endpoint and does not use the audit fetcher.
 *
 * Docs (checked 2026-10-26): https://developer.chrome.com/docs/crux/api
 */

export type FieldDataStatus = "ok" | "no_data" | "not_configured" | "quota_exceeded" | "error" | "skipped";

export interface FieldMetrics {
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
}

export interface FieldDataResult {
  status: FieldDataStatus;
  formFactor: "PHONE";
  /** Which record answered: the audited page or the whole site. */
  scope: "url" | "origin" | null;
  /** The URL or origin of that record. */
  key: string | null;
  /** ISO dates (YYYY-MM-DD) of the 28-day window. */
  collectionPeriod: { firstDate: string; lastDate: string } | null;
  /** 75th percentile of each metric. */
  metrics: FieldMetrics | null;
  error: string | null;
}

export type FieldMetricName = "lcp" | "inp" | "cls";
export type FieldRating = "good" | "needs_improvement" | "poor";

/** Core Web Vitals thresholds (web.dev/articles/vitals): good ≤ first, poor > second. */
export const FIELD_THRESHOLDS: Record<FieldMetricName, [number, number]> = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
};

export function rateFieldMetric(metric: FieldMetricName, value: number): FieldRating {
  const [good, poor] = FIELD_THRESHOLDS[metric];
  if (value <= good) return "good";
  return value <= poor ? "needs_improvement" : "poor";
}

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const METRICS = [
  "largest_contentful_paint",
  "interaction_to_next_paint",
  "cumulative_layout_shift",
  "first_contentful_paint",
  "experimental_time_to_first_byte",
] as const;

export function emptyFieldData(status: FieldDataStatus, error: string | null = null): FieldDataResult {
  return { status, formFactor: "PHONE", scope: null, key: null, collectionPeriod: null, metrics: null, error };
}

/** p75 is a number for timings and a string for CLS ("0.05"). */
function p75(metrics: Record<string, { percentiles?: { p75?: unknown } }> | undefined, name: string): number | null {
  const raw = metrics?.[name]?.percentiles?.p75;
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function isoDate(raw: unknown): string | null {
  const d = raw as { year?: unknown; month?: unknown; day?: unknown } | undefined;
  if (typeof d?.year !== "number" || typeof d.month !== "number" || typeof d.day !== "number") return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Maps a queryRecord response body. Exported for tests. */
export function mapCruxResponse(body: unknown, scope: "url" | "origin", key: string): FieldDataResult {
  const record = (body as { record?: Record<string, unknown> })?.record;
  if (!record) return emptyFieldData("error", "Respuesta de CrUX sin record");
  const metrics = record.metrics as Record<string, { percentiles?: { p75?: unknown } }> | undefined;
  const mapped: FieldMetrics = {
    lcpMs: p75(metrics, "largest_contentful_paint"),
    inpMs: p75(metrics, "interaction_to_next_paint"),
    cls: p75(metrics, "cumulative_layout_shift"),
    fcpMs: p75(metrics, "first_contentful_paint"),
    ttfbMs: p75(metrics, "experimental_time_to_first_byte"),
  };
  if (Object.values(mapped).every((v) => v === null)) return emptyFieldData("no_data");
  const period = record.collectionPeriod as { firstDate?: unknown; lastDate?: unknown } | undefined;
  const firstDate = isoDate(period?.firstDate);
  const lastDate = isoDate(period?.lastDate);
  return {
    status: "ok",
    formFactor: "PHONE",
    scope,
    key,
    collectionPeriod: firstDate && lastDate ? { firstDate, lastDate } : null,
    metrics: mapped,
    error: null,
  };
}

type QueryOutcome = { kind: "found"; body: unknown } | { kind: "not_found" } | { kind: "failed"; result: FieldDataResult };

async function query(
  identifier: { url: string } | { origin: string },
  options: { apiKey: string; timeoutMs: number; fetchImpl: typeof fetch },
): Promise<QueryOutcome> {
  try {
    const response = await options.fetchImpl(`${ENDPOINT}?${new URLSearchParams({ key: options.apiKey })}`, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...identifier, formFactor: "PHONE", metrics: METRICS }),
    });
    if (response.status === 404) return { kind: "not_found" };
    if (response.status === 429) {
      return { kind: "failed", result: emptyFieldData("quota_exceeded", "Cuota de la API de CrUX agotada") };
    }
    if (response.status === 403) {
      return { kind: "failed", result: emptyFieldData("error", "La clave no tiene habilitada la API Chrome UX Report") };
    }
    if (!response.ok) return { kind: "failed", result: emptyFieldData("error", `La API de CrUX respondió ${response.status}`) };
    return { kind: "found", body: await response.json() };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      kind: "failed",
      result: emptyFieldData("error", timeout ? "La API de CrUX no respondió a tiempo" : "No se pudo consultar la API de CrUX"),
    };
  }
}

export async function runCrux(
  url: string,
  options: { apiKey: string | undefined; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<FieldDataResult> {
  if (!options.apiKey) return emptyFieldData("not_configured");
  const settings = { apiKey: options.apiKey, timeoutMs: options.timeoutMs ?? 15_000, fetchImpl: options.fetchImpl ?? fetch };

  const page = await query({ url }, settings);
  if (page.kind === "failed") return page.result;
  if (page.kind === "found") return mapCruxResponse(page.body, "url", url);

  const origin = new URL(url).origin;
  const site = await query({ origin }, settings);
  if (site.kind === "failed") return site.result;
  if (site.kind === "not_found") return emptyFieldData("no_data");
  return mapCruxResponse(site.body, "origin", origin);
}
