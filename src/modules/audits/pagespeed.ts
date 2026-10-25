/**
 * PageSpeed Insights (lab data only, mobile). The request goes to Google's fixed endpoint,
 * so it does not use the audit fetcher: Google, not us, fetches the audited page.
 *
 * Optional dependency: without PAGESPEED_API_KEY the section is "not_configured". Anonymous
 * calls share a Google project whose daily quota was exhausted when tested (2026-10-25), so
 * a key is required in practice. Field data (CrUX) is not used (being retired from PSI).
 */

/** `skipped`: not requested because the page itself could not be read. */
export type PerformanceStatus = "ok" | "not_configured" | "quota_exceeded" | "error" | "skipped";

export interface PerformanceResult {
  status: PerformanceStatus;
  strategy: "mobile";
  /** Lighthouse performance score, 0–100. */
  score: number | null;
  metrics: {
    lcpMs: number | null;
    cls: number | null;
    tbtMs: number | null;
    fcpMs: number | null;
    speedIndexMs: number | null;
  } | null;
  lighthouseVersion: string | null;
  error: string | null;
}

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export function emptyResult(status: PerformanceStatus, error: string | null = null): PerformanceResult {
  return { status, strategy: "mobile", score: null, metrics: null, lighthouseVersion: null, error };
}

function numeric(audits: Record<string, { numericValue?: unknown }> | undefined, id: string): number | null {
  const value = audits?.[id]?.numericValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Maps a PSI v5 response body. Exported for tests. */
export function mapPageSpeedResponse(body: unknown): PerformanceResult {
  const lighthouse = (body as { lighthouseResult?: Record<string, unknown> })?.lighthouseResult;
  if (!lighthouse) return emptyResult("error", "Respuesta sin lighthouseResult");
  const runtimeError = lighthouse.runtimeError as { code?: string; message?: string } | undefined;
  if (runtimeError?.code && runtimeError.code !== "NO_ERROR") {
    return emptyResult("error", `Lighthouse: ${runtimeError.code}`);
  }
  const audits = lighthouse.audits as Record<string, { numericValue?: unknown }> | undefined;
  const rawScore = (lighthouse.categories as { performance?: { score?: unknown } } | undefined)?.performance?.score;
  return {
    status: "ok",
    strategy: "mobile",
    score: typeof rawScore === "number" ? Math.round(rawScore * 100) : null,
    metrics: {
      lcpMs: numeric(audits, "largest-contentful-paint"),
      cls: numeric(audits, "cumulative-layout-shift"),
      tbtMs: numeric(audits, "total-blocking-time"),
      fcpMs: numeric(audits, "first-contentful-paint"),
      speedIndexMs: numeric(audits, "speed-index"),
    },
    lighthouseVersion: typeof lighthouse.lighthouseVersion === "string" ? lighthouse.lighthouseVersion : null,
    error: null,
  };
}

export async function runPageSpeed(
  url: string,
  options: { apiKey: string | undefined; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<PerformanceResult> {
  if (!options.apiKey) return emptyResult("not_configured");
  const query = new URLSearchParams({ url, strategy: "mobile", category: "performance", key: options.apiKey });
  try {
    const response = await (options.fetchImpl ?? fetch)(`${ENDPOINT}?${query}`, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      headers: { accept: "application/json" },
    });
    if (response.status === 429) return emptyResult("quota_exceeded", "Cuota de PageSpeed Insights agotada");
    if (!response.ok) return emptyResult("error", `PageSpeed Insights respondió ${response.status}`);
    return mapPageSpeedResponse(await response.json());
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return emptyResult("error", timeout ? "PageSpeed Insights no respondió a tiempo" : "No se pudo consultar PageSpeed Insights");
  }
}
