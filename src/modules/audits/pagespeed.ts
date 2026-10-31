/**
 * PageSpeed Insights (lab data only, mobile): the performance score and metrics, plus the
 * SEO, accessibility and best-practices categories of the same Lighthouse run. The request goes to Google's fixed endpoint,
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
  /**
   * SEO, accessibility and best-practices scores from the same Lighthouse run. Absent in
   * audits stored before 2026-10-28, which never measured them (never read as zero).
   */
  categories?: Partial<Record<LighthouseCategoryId, LighthouseCategory>>;
  /** Language of the Lighthouse texts stored in `categories` (the request's `locale`). */
  textLocale?: "es";
}

/** Extra Lighthouse categories requested with performance (one run, no extra cost). */
export const LIGHTHOUSE_CATEGORIES = ["seo", "accessibility", "best-practices"] as const;
export type LighthouseCategoryId = (typeof LIGHTHOUSE_CATEGORIES)[number];

export interface LighthouseCheck {
  id: string;
  /** Lighthouse's own title, in `textLocale`. Plain text. */
  title: string;
  /** 0–100. */
  score: number;
}

export interface LighthouseCategory {
  /** 0–100, or null when Lighthouse could not score the category. */
  score: number | null;
  /** Checks that count towards the score. */
  scored: number;
  /** Scored checks below Lighthouse's pass mark, all of them. */
  failingTotal: number;
  /** The heaviest failing checks, at most MAX_FAILING. */
  failing: LighthouseCheck[];
}

/** Lighthouse marks a check as passed from 0.9. */
const PASS_MARK = 0.9;
const SCORED_MODES = new Set(["binary", "numeric", "metricSavings"]);
export const MAX_FAILING = 15;
const MAX_TITLE = 200;
const CHECK_ID = /^[a-z0-9-]{1,100}$/i;
/** Postgres rejects a NUL or half a surrogate pair in jsonb, and the whole audit with it. */
const cleanText = (text: string, max: number) => text.replaceAll("\0", "").trim().slice(0, max).toWellFormed();

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
    categories: mapCategories(lighthouse),
    textLocale: "es",
  };
}

type RawAudit = { title?: unknown; score?: unknown; scoreDisplayMode?: unknown };
type RawCategory = { score?: unknown; auditRefs?: { id?: unknown; weight?: unknown }[] };

function mapCategory(raw: RawCategory, audits: Record<string, RawAudit>): LighthouseCategory {
  const refs = Array.isArray(raw.auditRefs) ? raw.auditRefs : [];
  const seen = new Set<string>();
  const scored = refs.flatMap((ref) => {
    if (typeof ref?.id !== "string" || !CHECK_ID.test(ref.id) || seen.has(ref.id)) return [];
    seen.add(ref.id);
    const audit = audits[ref.id];
    if (!audit || typeof audit.scoreDisplayMode !== "string" || !SCORED_MODES.has(audit.scoreDisplayMode)) return [];
    if (typeof audit.score !== "number" || !Number.isFinite(audit.score)) return [];
    const weight = typeof ref.weight === "number" && Number.isFinite(ref.weight) ? ref.weight : 0;
    // Without weight it does not move the score: counting it could show 100/100 with a failing check.
    if (weight <= 0) return [];
    const title = (typeof audit.title === "string" && cleanText(audit.title, MAX_TITLE)) || ref.id;
    return [{ id: ref.id, title, raw: audit.score, weight }];
  });
  const failing = scored
    .filter((c) => c.raw < PASS_MARK)
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .map((c) => ({ id: c.id, title: c.title, score: Math.round(Math.min(Math.max(c.raw, 0), 1) * 100) }));
  return {
    score: typeof raw.score === "number" && raw.score >= 0 && raw.score <= 1 ? Math.round(raw.score * 100) : null,
    scored: scored.length,
    failingTotal: failing.length,
    failing: failing.slice(0, MAX_FAILING),
  };
}

function mapCategories(lighthouse: Record<string, unknown>): Partial<Record<LighthouseCategoryId, LighthouseCategory>> {
  const categories = (lighthouse.categories ?? {}) as Record<string, RawCategory | undefined>;
  const audits = (lighthouse.audits ?? {}) as Record<string, RawAudit>;
  const result: Partial<Record<LighthouseCategoryId, LighthouseCategory>> = {};
  for (const id of LIGHTHOUSE_CATEGORIES) {
    const raw = categories[id];
    if (raw && typeof raw === "object") result[id] = mapCategory(raw, audits);
  }
  return result;
}

/**
 * PageSpeed answers 5xx now and then while a repeat moments later succeeds (seen on
 * 2026-10-28). One more attempt after a short pause covers that, within the same deadline:
 * the audit waits for this call. Timeouts and network errors are not repeated.
 */
export const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2_000;

export async function runPageSpeed(
  url: string,
  options: { apiKey: string | undefined; timeoutMs?: number; fetchImpl?: typeof fetch; retryDelayMs?: number },
): Promise<PerformanceResult> {
  if (!options.apiKey) return emptyResult("not_configured");
  // One run for every category (D001); Lighthouse texts in Spanish, the reference copy (D002).
  const query = new URLSearchParams({ url, strategy: "mobile", locale: "es", key: options.apiKey });
  for (const category of ["performance", ...LIGHTHOUSE_CATEGORIES]) query.append("category", category);
  try {
    const signal = AbortSignal.timeout(options.timeoutMs ?? 60_000);
    for (let attempt = 1; ; attempt++) {
      const response = await (options.fetchImpl ?? fetch)(`${ENDPOINT}?${query}`, { signal, headers: { accept: "application/json" } });
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
        continue;
      }
      if (response.status === 429) return emptyResult("quota_exceeded", "Cuota de PageSpeed Insights agotada");
      if (!response.ok) return emptyResult("error", `PageSpeed Insights respondió ${response.status}`);
      return mapPageSpeedResponse(await response.json());
    }
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return emptyResult("error", timeout ? "PageSpeed Insights no respondió a tiempo" : "No se pudo consultar PageSpeed Insights");
  }
}
