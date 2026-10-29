import { z } from "zod";
import { isServiceDisabled } from "@/modules/search-console/google";

/**
 * Minimal read-only REST client for Google Analytics 4 with a service-account token (feature 006):
 * the Admin API to find the property, the Data API for reports. Fixed hosts, bounded time, typed
 * errors. Responses are read by header name, never by position (FR-010).
 *
 * Docs (checked 2026-10-28):
 * - https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list
 * - https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.dataStreams
 * - https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
 */

export const ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";
export const DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
export const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export type Ga4ErrorKind = "invalid_credentials" | "admin_api_disabled" | "data_api_disabled" | "no_access" | "quota_exceeded" | "error";

/** Messages are fixed texts: never the token, the URL, a response body or Google's own message. */
export class Ga4Error extends Error {
  constructor(
    public readonly kind: Ga4ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "Ga4Error";
  }
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Cancels the call together with others of the same capture (feature 008 reviews). */
  signal?: AbortSignal;
}

type Api = "admin" | "data";

const API_NAMES: Record<Api, string> = { admin: "Google Analytics Admin API", data: "Google Analytics Data API" };

async function call(api: Api, path: string, init: RequestInit, token: string, options: ClientOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const name = API_NAMES[api];
  let response: Response;
  try {
    response = await fetchImpl(`${api === "admin" ? ADMIN_BASE : DATA_BASE}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}`, accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 15_000)])
        : AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    // The original error may quote the request, so it is dropped rather than kept as `cause`.
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new Ga4Error("error", timeout ? `${name} no respondió a tiempo` : `No se pudo contactar con ${name}`);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON bodies are handled below.
  }
  if (response.ok) {
    if (body === null) throw new Ga4Error("error", `Respuesta de ${name} que no es JSON`);
    return body;
  }
  if (response.status === 401) throw new Ga4Error("invalid_credentials", `${name} no aceptó el acceso de la cuenta de servicio`);
  if (response.status === 403) {
    if (isServiceDisabled(body)) {
      throw new Ga4Error(api === "admin" ? "admin_api_disabled" : "data_api_disabled", `${name} no está activada en el proyecto de Google Cloud de la cuenta de servicio`);
    }
    throw new Ga4Error("no_access", `La cuenta de servicio no tiene permiso en ${name}`);
  }
  if (response.status === 429) throw new Ga4Error("quota_exceeded", `Cuota de ${name} agotada; prueba más tarde`);
  throw new Ga4Error("error", `${name} respondió ${response.status}`);
}

function parse<T>(what: string, schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".") ?? "";
    throw new Ga4Error("error", `Respuesta de ${what} con un formato inesperado${path ? ` en ${path}` : ""}`);
  }
  return parsed.data;
}

const PROPERTY = /^properties\/\d{1,20}$/;
const propertyId = z.string().regex(PROPERTY);

export interface PropertySummary {
  /** `properties/<id>`. */
  property: string;
  displayName: string;
}

const summariesSchema = z.object({
  accountSummaries: z
    .array(z.object({ propertySummaries: z.array(z.object({ property: propertyId, displayName: z.string().max(500).optional() })).optional() }))
    .optional(),
  nextPageToken: z.string().optional(),
});

/** One page of 200 (FR-004); `more` says the service account sees further properties. */
export async function listPropertySummaries(token: string, options: ClientOptions = {}): Promise<{ properties: PropertySummary[]; more: boolean }> {
  const body = parse("accountSummaries", summariesSchema, await call("admin", "/accountSummaries?pageSize=200", { method: "GET" }, token, options));
  const properties = (body.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ property: p.property, displayName: p.displayName ?? "" })));
  return { properties, more: Boolean(body.nextPageToken) };
}

const streamsSchema = z.object({
  dataStreams: z.array(z.object({ type: z.string().optional(), webStreamData: z.object({ defaultUri: z.string().max(2048).optional() }).optional() })).optional(),
});

function hostOf(uri: string): string | null {
  try {
    return new URL(uri.includes("://") ? uri : `https://${uri}`).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Hosts of the property's web streams, lowercased; app streams are ignored. */
export async function listWebStreamHosts(token: string, property: string, options: ClientOptions = {}): Promise<string[]> {
  if (!PROPERTY.test(property)) throw new Ga4Error("error", "Identificador de propiedad de Google Analytics no válido");
  const body = parse("dataStreams", streamsSchema, await call("admin", `/${property}/dataStreams?pageSize=200`, { method: "GET" }, token, options));
  const hosts = (body.dataStreams ?? [])
    .filter((s) => s.type === "WEB_DATA_STREAM" && s.webStreamData?.defaultUri)
    .map((s) => hostOf(s.webStreamData!.defaultUri!))
    .filter((h): h is string => h !== null);
  return [...new Set(hosts)];
}

const keyEventsSchema = z.object({
  keyEvents: z
    .array(z.object({ eventName: z.string().min(1).max(1000) }))
    .max(200)
    .optional(),
  nextPageToken: z.string().optional(),
});

export const MAX_KEY_EVENTS = 50;

/**
 * GA4 names cut to `max` characters by code point, without NUL: a cut in the middle of a
 * surrogate pair or a NUL would make Postgres reject the jsonb and lose the attempt.
 */
export function clipName(name: string, max: number): string {
  return Array.from(name.replaceAll("\u0000", "")).slice(0, max).join("");
}
const MAX_EVENT_NAME_LENGTH = 100;

/**
 * Key events configured in the property now (feature 008, D002): one page of 200, at most 50
 * names kept, `more` when GA4 has another page or there were more than 50. An entry without an
 * event name is a malformed answer, not a name to invent.
 */
export async function listKeyEvents(token: string, property: string, options: ClientOptions = {}): Promise<{ events: string[]; more: boolean }> {
  if (!PROPERTY.test(property)) throw new Ga4Error("error", "Identificador de propiedad de Google Analytics no válido");
  const body = parse("keyEvents", keyEventsSchema, await call("admin", `/${property}/keyEvents?pageSize=200`, { method: "GET" }, token, options));
  const all = body.keyEvents ?? [];
  return {
    events: all.slice(0, MAX_KEY_EVENTS).map((e) => clipName(e.eventName, MAX_EVENT_NAME_LENGTH)),
    more: Boolean(body.nextPageToken) || all.length > MAX_KEY_EVENTS,
  };
}

/** The only filter this app sends: sessions from one exact channel (feature 008, D003). */
export interface DimensionFilter {
  filter: {
    fieldName: "sessionDefaultChannelGroup";
    stringFilter: { matchType: "EXACT"; value: "Organic Search"; caseSensitive: true };
  };
}

export interface ReportRequest {
  dateRanges: { name: string; startDate: string; endDate: string }[];
  dimensions: string[];
  metrics: string[];
  /** Metric to sort by, descending. */
  orderBy?: string;
  /** Left out of the request body when absent, so the reports of feature 006 are unchanged. */
  dimensionFilter?: DimensionFilter;
  limit: number;
}

export interface ReportRow {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

/** What GA4 says about the data behind a report (FR-011). */
export interface Quality {
  otherRow: boolean;
  thresholded: boolean;
  sampled: boolean;
}

const reportSchema = z.object({
  dimensionHeaders: z.array(z.object({ name: z.string() })).optional(),
  metricHeaders: z.array(z.object({ name: z.string() })).optional(),
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string().optional() })).optional(),
        metricValues: z.array(z.object({ value: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  metadata: z
    .object({
      dataLossFromOtherRow: z.boolean().optional(),
      subjectToThresholding: z.boolean().optional(),
      samplingMetadatas: z.array(z.unknown()).optional(),
    })
    .optional(),
});

/** Counts arrive as text; they must be whole numbers small enough for exact sums. */
const COUNT = /^\d{1,13}$/;
/**
 * GA4 declares `keyEvents` as TYPE_FLOAT (metadata of the real property, D009 of 008): it may
 * come as "3.0" or with a fraction. Only that metric accepts decimals; the rest stay whole.
 */
const DECIMAL_METRICS: ReadonlySet<string> = new Set(["keyEvents"]);
const DECIMAL = /^\d{1,13}(\.\d{1,12})?$/;

export async function runReport(token: string, property: string, request: ReportRequest, options: ClientOptions = {}): Promise<{ rows: ReportRow[]; quality: Quality }> {
  if (!PROPERTY.test(property)) throw new Ga4Error("error", "Identificador de propiedad de Google Analytics no válido");
  const payload = {
    dateRanges: request.dateRanges,
    // GA4 rejects "dateRange" as a requested dimension (400); with several ranges it adds the column itself.
    dimensions: request.dimensions.filter((name) => name !== "dateRange").map((name) => ({ name })),
    metrics: request.metrics.map((name) => ({ name })),
    ...(request.orderBy ? { orderBys: [{ metric: { metricName: request.orderBy }, desc: true }] } : {}),
    ...(request.dimensionFilter ? { dimensionFilter: request.dimensionFilter } : {}),
    limit: String(request.limit),
  };
  const body = parse(
    "runReport",
    reportSchema,
    await call("data", `/${property}:runReport`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, token, options),
  );
  const rows = body.rows ?? [];
  const dimensionIndex = (body.dimensionHeaders ?? []).map((h) => h.name);
  const metricIndex = (body.metricHeaders ?? []).map((h) => h.name);
  if (rows.length > 0) {
    for (const name of request.dimensions) if (!dimensionIndex.includes(name)) throw new Ga4Error("error", `Respuesta de runReport sin la dimensión ${name}`);
    for (const name of request.metrics) if (!metricIndex.includes(name)) throw new Ga4Error("error", `Respuesta de runReport sin la métrica ${name}`);
  }
  const parsedRows = rows.map((row) => {
    const dimensions: Record<string, string> = {};
    for (const name of request.dimensions) dimensions[name] = row.dimensionValues?.[dimensionIndex.indexOf(name)]?.value ?? "";
    const metrics: Record<string, number> = {};
    for (const name of request.metrics) {
      const value = row.metricValues?.[metricIndex.indexOf(name)]?.value ?? "";
      const decimal = DECIMAL_METRICS.has(name);
      if (!(decimal ? DECIMAL : COUNT).test(value) || Number(value) > 1e12) {
        throw new Ga4Error("error", `Respuesta de runReport con un valor no ${decimal ? "válido" : "entero"} en ${name}`);
      }
      metrics[name] = Number(value);
    }
    return { dimensions, metrics };
  });
  const metadata = body.metadata ?? {};
  return {
    rows: parsedRows,
    quality: {
      otherRow: metadata.dataLossFromOtherRow === true,
      thresholded: metadata.subjectToThresholding === true,
      sampled: (metadata.samplingMetadatas?.length ?? 0) > 0,
    },
  };
}
