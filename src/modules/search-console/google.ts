import { createSign } from "node:crypto";
import { z } from "zod";
import type { ServiceAccount } from "@/modules/search-console/credentials";

/**
 * Minimal REST client for Google Search Console with a service account (D002): one signed
 * JWT for a token, then the Search Console API v3. Fixed endpoints, bounded time, typed errors.
 *
 * Docs (checked 2026-10-27):
 * - https://developers.google.com/identity/protocols/oauth2/service-account
 * - https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */

export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const API_BASE = "https://www.googleapis.com/webmasters/v3";
export const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type GscErrorKind = "invalid_credentials" | "api_disabled" | "no_access" | "quota_exceeded" | "keyword_limit" | "error";

/** Messages are owner-readable and never contain key material, tokens or response bodies. */
export class GscError extends Error {
  constructor(
    public readonly kind: GscErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GscError";
  }
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function settings(options: ClientOptions) {
  return { fetchImpl: options.fetchImpl ?? fetch, timeoutMs: options.timeoutMs ?? 15_000 };
}

const b64url = (value: string) => Buffer.from(value).toString("base64url");

/**
 * RS256 JWT for the token endpoint; 1 hour lifetime (the documented maximum). Exported for tests.
 * The scope defaults to Search Console's; Google Analytics passes its own (feature 006, D004).
 */
export function signJwt(account: ServiceAccount, nowSeconds: number, scope: string = SCOPE): string {
  const header = { alg: "RS256", typ: "JWT", ...(account.privateKeyId ? { kid: account.privateKeyId } : {}) };
  const claims = { iss: account.clientEmail, scope, aud: TOKEN_ENDPOINT, iat: nowSeconds, exp: nowSeconds + 3600 };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

async function send(url: string, init: RequestInit, options: ClientOptions, what: string): Promise<Response> {
  const { fetchImpl, timeoutMs } = settings(options);
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new GscError("error", timeout ? `${what} no respondió a tiempo` : `No se pudo contactar con ${what}`);
  }
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const tokenSchema = z.object({ access_token: z.string().min(1) });

export async function fetchAccessToken(account: ServiceAccount, options: ClientOptions & { nowSeconds?: number; scope?: string } = {}): Promise<string> {
  const assertion = signJwt(account, options.nowSeconds ?? Math.floor(Date.now() / 1000), options.scope);
  const response = await send(
    TOKEN_ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    },
    options,
    "El servicio de acceso de Google",
  );
  const body = await bodyOf(response);
  if (response.status === 400 || response.status === 401) {
    throw new GscError("invalid_credentials", "Google rechazó la clave de la cuenta de servicio (revocada, borrada o con el reloj del servidor desfasado)");
  }
  if (!response.ok) throw new GscError("error", `El servicio de acceso de Google respondió ${response.status}`);
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) throw new GscError("error", "Respuesta de acceso de Google sin token");
  return parsed.data.access_token;
}

/** Google's 403 means either "API not enabled in the project" or "no permission on this property". Shared with Google Analytics (feature 006). */
export function isServiceDisabled(body: unknown): boolean {
  const error = (body as { error?: { message?: unknown; details?: { reason?: unknown }[]; errors?: { reason?: unknown }[] } })?.error;
  const reasons = [...(error?.details ?? []), ...(error?.errors ?? [])].map((d) => d?.reason);
  if (reasons.includes("SERVICE_DISABLED") || reasons.includes("accessNotConfigured")) return true;
  return typeof error?.message === "string" && /has not been used in project|is disabled/i.test(error.message);
}

async function api(token: string, path: string, init: RequestInit, options: ClientOptions): Promise<unknown> {
  const response = await send(
    `${API_BASE}${path}`,
    { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, accept: "application/json" } },
    options,
    "Search Console",
  );
  const body = await bodyOf(response);
  if (response.ok) return body;
  if (response.status === 401) throw new GscError("invalid_credentials", "Search Console no aceptó el acceso de la cuenta de servicio");
  if (response.status === 403) {
    if (isServiceDisabled(body)) {
      throw new GscError("api_disabled", "La API de Google Search Console no está activada en el proyecto de Google Cloud de la cuenta de servicio");
    }
    throw new GscError("no_access", "La cuenta de servicio no tiene permiso sobre esta propiedad de Search Console");
  }
  if (response.status === 429) throw new GscError("quota_exceeded", "Cuota de la API de Search Console agotada; prueba más tarde");
  throw new GscError("error", `Search Console respondió ${response.status}`);
}

export type PermissionLevel = "siteOwner" | "siteFullUser" | "siteRestrictedUser" | "siteUnverifiedUser";
export interface SiteEntry {
  siteUrl: string;
  permissionLevel: string;
}

const sitesSchema = z.object({
  siteEntry: z.array(z.object({ siteUrl: z.string().min(1).max(2048), permissionLevel: z.string() })).optional(),
});

export async function listSites(token: string, options: ClientOptions = {}): Promise<SiteEntry[]> {
  const parsed = sitesSchema.safeParse(await api(token, "/sites", { method: "GET" }, options));
  if (!parsed.success) throw new GscError("error", "Respuesta de Search Console con un formato inesperado");
  return parsed.data.siteEntry ?? [];
}

export interface AnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** The only filter this app sends: queries that do or do not match the brand expression (feature 007). */
export interface DimensionFilterGroup {
  groupType: "and";
  filters: { dimension: "query"; operator: "includingRegex" | "excludingRegex"; expression: string }[];
}

export interface AnalyticsQuery {
  startDate: string;
  endDate: string;
  dimensions: ("query" | "page" | "date")[];
  rowLimit: number;
  /** Absent keys are left out of the request body, so unfiltered queries are unchanged. */
  dimensionFilterGroups?: DimensionFilterGroup[];
}

const metric = z.number().finite().nonnegative();
const analyticsSchema = z.object({
  rows: z
    .array(
      z.object({
        keys: z.array(z.string()).optional(),
        clicks: metric,
        impressions: metric,
        ctr: metric.max(1),
        position: metric,
      }),
    )
    .optional(),
});

export async function querySearchAnalytics(token: string, siteUrl: string, query: AnalyticsQuery, options: ClientOptions = {}): Promise<AnalyticsRow[]> {
  const body = await api(
    token,
    `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...query, type: "web", dataState: "final" }),
    },
    options,
  );
  const parsed = analyticsSchema.safeParse(body);
  if (!parsed.success) throw new GscError("error", "Respuesta de Search Console con un formato inesperado");
  return (parsed.data.rows ?? []).map((r) => ({ keys: r.keys ?? [], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}
