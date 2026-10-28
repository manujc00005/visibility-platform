import { z } from "zod";

/**
 * Minimal read-only client for the Bing Webmaster API (JSON). The user API key travels in the
 * query string, the only way Bing documents it, so the full URL exists only inside `call` and
 * never reaches an error, a log or the caller (feature 005, NFR security).
 *
 * Docs (checked 2026-10-28):
 * - https://learn.microsoft.com/en-us/bingwebmaster/getting-started
 * - https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi
 * - https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.apierrorcode
 */

export const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json/";

export type BingErrorKind = "invalid_credentials" | "quota_exceeded" | "no_access" | "not_verified" | "error";

/** Messages are fixed texts: never the key, the URL, a response body or Bing's own `Message`. */
export class BingError extends Error {
  constructor(
    public readonly kind: BingErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BingError";
  }
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Method = "GetUserSites" | "GetRankAndTrafficStats" | "GetQueryStats" | "GetPageStats";

/** ApiErrorCode values (FR-009); any other code is a generic error. */
const ERROR_KINDS: Record<number, BingErrorKind> = {
  3: "invalid_credentials", // InvalidApiKey
  6: "invalid_credentials", // UserBlocked
  10: "invalid_credentials", // UserNotFound
  4: "quota_exceeded", // ThrottleUser
  5: "quota_exceeded", // ThrottleHost
  11: "no_access", // NotFound
  14: "no_access", // NotAuthorized
};

const ERROR_MESSAGES: Record<BingErrorKind, string> = {
  invalid_credentials: "Bing rechazó la clave de API (inválida, borrada o de una cuenta bloqueada)",
  quota_exceeded: "Cuota de la API de Bing Webmaster agotada; prueba más tarde",
  no_access: "La cuenta de la clave no tiene acceso a este sitio en Bing Webmaster Tools",
  not_verified: "El sitio no está verificado en Bing Webmaster Tools",
  error: "Bing Webmaster devolvió un error",
};

const errorBodySchema = z.object({ ErrorCode: z.number().int() });
const envelopeSchema = z.object({ d: z.array(z.unknown()).nullable() });

async function call(method: Method, params: Record<string, string>, apiKey: string, options: ClientOptions): Promise<unknown[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    const url = new URL(method, API_BASE);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set("apikey", apiKey);
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    // The original error may quote the URL, so it is dropped rather than kept as `cause`.
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new BingError("error", timeout ? "Bing Webmaster no respondió a tiempo" : "No se pudo contactar con Bing Webmaster");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON bodies are handled below as unexpected.
  }
  if (response.status === 400) {
    const parsed = errorBodySchema.safeParse(body);
    if (!parsed.success) throw new BingError("error", "Bing Webmaster respondió 400");
    const code = parsed.data.ErrorCode;
    const kind = ERROR_KINDS[code] ?? "error";
    // The numeric code is safe to keep and tells apart e.g. an invalid key (3) from a blocked account (6).
    throw new BingError(kind, kind === "error" ? `Bing Webmaster devolvió el error ${code}` : `${ERROR_MESSAGES[kind]} (código ${code})`);
  }
  if (!response.ok) throw new BingError("error", `Bing Webmaster respondió ${response.status}`);
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) throw new BingError("error", `Respuesta de ${method} con un formato inesperado`);
  return envelope.data.d ?? [];
}

/** The message names the method and the failing field path (never a value) to diagnose real responses (T009). */
function parseRows<T>(method: Method, rows: unknown[], schema: z.ZodType<T>): T[] {
  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".") ?? "";
    throw new BingError("error", `Respuesta de ${method} con un formato inesperado${path ? ` en ${path}` : ""}`);
  }
  return parsed.data;
}

const DATE_PATTERN = /^\/Date\((-?\d+)([+-])(\d{2})(\d{2})\)\/$|^\/Date\((-?\d+)\)\/$/;

/** `/Date(<ms><±hhmm>)/` → the calendar day (YYYY-MM-DD) at that offset; UTC without one (FR-007, D010). */
export function parseBingDate(value: string): string | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const ms = Number(match[1] ?? match[5]);
  const offsetMinutes = match[1] === undefined ? 0 : (match[2] === "-" ? -1 : 1) * (Number(match[3]) * 60 + Number(match[4]));
  const shifted = new Date(ms + offsetMinutes * 60_000);
  if (Number.isNaN(shifted.getTime())) return null;
  const day = shifted.toISOString().slice(0, 10);
  // Years outside 0000–9999 serialize as "+010000-…", which Postgres would reject.
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Counts: whole, non-negative and small enough that 28-day sums stay exact. */
const metric = z.number().int().nonnegative().max(1e12);
const bingDay = z.string().transform((value, ctx) => {
  const day = parseBingDate(value);
  if (!day) ctx.addIssue({ code: "custom", message: "bad date" });
  return day ?? "";
});

export interface Site {
  url: string;
  isVerified: boolean;
}

const siteSchema = z.object({ Url: z.string().min(1).max(2048), IsVerified: z.boolean() });

export async function getUserSites(apiKey: string, options: ClientOptions = {}): Promise<Site[]> {
  return parseRows("GetUserSites", await call("GetUserSites", {}, apiKey, options), siteSchema).map((s) => ({ url: s.Url, isVerified: s.IsVerified }));
}

export interface DailyTraffic {
  day: string;
  clicks: number;
  impressions: number;
}

const trafficSchema = z.object({ Date: bingDay, Clicks: metric, Impressions: metric });

export async function getRankAndTrafficStats(apiKey: string, siteUrl: string, options: ClientOptions = {}): Promise<DailyTraffic[]> {
  return parseRows("GetRankAndTrafficStats", await call("GetRankAndTrafficStats", { siteUrl }, apiKey, options), trafficSchema).map((r) => ({
    day: r.Date,
    clicks: r.Clicks,
    impressions: r.Impressions,
  }));
}

/** One query (or page URL) row as Bing returns it; `position` is null when Bing has none (< 1). */
export interface StatsRow {
  key: string;
  day: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

const statsSchema = z.object({
  Query: z.string(),
  Date: bingDay,
  Clicks: metric,
  Impressions: metric,
  AvgImpressionPosition: z.number().finite().nullish(),
});

function toStatsRows(method: Method, rows: unknown[], maxKeyLength: number): StatsRow[] {
  return parseRows(method, rows, statsSchema).map((r) => ({
    key: r.Query.slice(0, maxKeyLength),
    day: r.Date,
    clicks: r.Clicks,
    impressions: r.Impressions,
    position: r.AvgImpressionPosition != null && r.AvgImpressionPosition >= 1 ? r.AvgImpressionPosition : null,
  }));
}

export async function getQueryStats(apiKey: string, siteUrl: string, options: ClientOptions = {}): Promise<StatsRow[]> {
  return toStatsRows("GetQueryStats", await call("GetQueryStats", { siteUrl }, apiKey, options), 200);
}

/** Assumed to share QueryStats' shape with the page URL in `Query` (SPEC assumptions; checked in T009). */
export async function getPageStats(apiKey: string, siteUrl: string, options: ClientOptions = {}): Promise<StatsRow[]> {
  return toStatsRows("GetPageStats", await call("GetPageStats", { siteUrl }, apiKey, options), 500);
}
