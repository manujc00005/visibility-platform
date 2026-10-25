import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type Socket } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Transform } from "node:stream";
import { isPublicAddress } from "@/modules/audits/fetcher/address-policy";

/**
 * Outbound HTTP for the audit engine (B08a). Every URL — the start URL, each redirect hop,
 * robots.txt, sitemaps — goes through `fetch`, which:
 *
 * - accepts only http/https on the default port, without embedded credentials;
 * - resolves the hostname once, refuses it if ANY resolved address is non-public, and
 *   connects to exactly that validated address (DNS-rebinding safe). TLS still verifies
 *   the certificate against the real hostname (SNI + Host header are the hostname);
 * - re-validates every redirect hop (max 5);
 * - enforces per-response limits on decompressed bytes (gzip-bomb safe) and time, plus a
 *   per-audit budget of requests, bytes and wall-clock time shared by all fetches.
 *
 * Non-2xx responses are data, not failures. Only transport and policy problems fail.
 */

export type Resolver = (hostname: string) => Promise<string[]>;

export interface SafeFetcherDeps {
  userAgent: string;
  /** Defaults to the system resolver. Injected in tests. */
  resolve?: Resolver;
  /** Test-only transport override: receives the validated IP. Never set in production. */
  connect?: (ip: string, port: number) => Socket;
}

export interface FetchLimits {
  /** Maximum decompressed body size for this response. */
  maxBytes: number;
  /** Per-request timeout (each redirect hop is a request). */
  timeoutMs: number;
  accept?: string;
}

export type FetchFailureKind =
  | "invalid_url"
  | "blocked_destination"
  | "dns"
  | "network"
  | "timeout"
  | "too_many_redirects"
  | "too_large"
  | "unsupported_encoding"
  | "budget_exhausted";

export interface FetchFailure {
  kind: FetchFailureKind;
  message: string;
  url: string;
}

export interface FetchLogEntry {
  url: string;
  outcome: "ok" | "redirect" | FetchFailureKind;
  status: number | null;
  bytes: number;
  ms: number;
  ip: string | null;
  /** Failure reason for this request, if any. */
  error: string | null;
}

export interface SafeResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  contentType: string | null;
  body: Buffer;
  redirects: { url: string; status: number; location: string }[];
  ip: string;
}

export type FetchResult = { ok: true; response: SafeResponse } | { ok: false; failure: FetchFailure };

export interface FetchBudget {
  readonly maxRequests: number;
  readonly maxTotalBytes: number;
  readonly deadline: number;
  requests: number;
  bytes: number;
  log: FetchLogEntry[];
}

export function createBudget(options: { maxRequests: number; maxTotalBytes: number; timeLimitMs: number }): FetchBudget {
  return {
    maxRequests: options.maxRequests,
    maxTotalBytes: options.maxTotalBytes,
    deadline: Date.now() + options.timeLimitMs,
    requests: 0,
    bytes: 0,
    log: [],
  };
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class FetchError extends Error {
  constructor(
    public readonly kind: FetchFailureKind,
    message: string,
  ) {
    super(message);
  }
}

const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

function parseUrl(value: string, base?: URL): URL {
  try {
    return new URL(value, base);
  } catch {
    throw new FetchError("invalid_url", "Not a valid URL");
  }
}

function assertAllowedTarget(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("invalid_url", `Scheme ${url.protocol} is not allowed`);
  }
  if (url.username || url.password) throw new FetchError("invalid_url", "Embedded credentials are not allowed");
  if (url.port !== "") throw new FetchError("invalid_url", `Port ${url.port} is not allowed`);
  if (!url.hostname) throw new FetchError("invalid_url", "Missing hostname");
}

function bareHostname(url: URL): string {
  return url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
}

async function resolvePublicAddress(hostname: string, resolve: Resolver): Promise<string> {
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new FetchError("blocked_destination", "Destination address is not public");
    return hostname;
  }
  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    throw new FetchError("dns", `Could not resolve ${hostname}${code ? ` (${code})` : ""}`);
  }
  if (addresses.length === 0) throw new FetchError("dns", `No addresses for ${hostname}`);
  // Refuse if ANY result is non-public: otherwise the connection could land on it.
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new FetchError("blocked_destination", `${hostname} resolves to a non-public address`);
  }
  return addresses[0]!;
}

function decoderFor(encoding: string): Transform | null {
  switch (encoding) {
    case "":
    case "identity":
      return null;
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      throw new FetchError("unsupported_encoding", `Content-Encoding ${encoding} is not supported`);
  }
}

function flattenHeaders(res: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(res.headers)) {
    if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export function createSafeFetcher(deps: SafeFetcherDeps) {
  const resolve = deps.resolve ?? systemResolver;

  function requestOnce(url: URL, ip: string, limits: FetchLimits, budget: FetchBudget): Promise<RawResponse> {
    const remainingTime = budget.deadline - Date.now();
    const timeoutMs = Math.max(1, Math.min(limits.timeoutMs, remainingTime));
    const byteCap = Math.min(limits.maxBytes, budget.maxTotalBytes - budget.bytes);
    const capIsBudget = budget.maxTotalBytes - budget.bytes < limits.maxBytes;
    const isHttps = url.protocol === "https:";
    const port = isHttps ? 443 : 80;
    const hostname = bareHostname(url);
    const family = isIP(ip) === 6 ? 6 : 4;

    return new Promise<RawResponse>((resolvePromise, reject) => {
      let settled = false;
      const fail = (error: FetchError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.destroy();
        reject(error);
      };
      const timer = setTimeout(() => fail(new FetchError("timeout", `No complete response within ${timeoutMs} ms`)), timeoutMs);

      const send = isHttps ? httpsRequest : httpRequest;
      const req = send(
        {
          host: hostname,
          port,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          // No connection reuse in production (each request is pinned to its own validated IP).
          // A request-level createConnection is only honoured when no agent is set.
          agent: deps.connect ? undefined : false,
          // Pin the connection to the address validated above; Node must not resolve again.
          lookup: (_host, options, callback) => {
            const cb = callback as (...args: unknown[]) => void;
            if ((options as { all?: boolean }).all) cb(null, [{ address: ip, family }]);
            else cb(null, ip, family);
          },
          ...(isHttps && !isIP(hostname) ? { servername: hostname } : {}),
          ...(deps.connect ? { createConnection: () => deps.connect!(ip, port) } : {}),
          headers: {
            "user-agent": deps.userAgent,
            accept: limits.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "es-ES,es;q=0.9,en;q=0.5",
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const headers = flattenHeaders(res);
          if (REDIRECT_STATUSES.has(status)) {
            res.destroy();
            settled = true;
            clearTimeout(timer);
            resolvePromise({ status, headers, body: Buffer.alloc(0) });
            return;
          }
          let decoder: Transform | null;
          try {
            decoder = decoderFor((headers["content-encoding"] ?? "").trim().toLowerCase());
          } catch (error) {
            fail(error as FetchError);
            return;
          }
          const source = decoder ? res.pipe(decoder) : res;
          const chunks: Buffer[] = [];
          let size = 0;
          source.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > byteCap) {
              decoder?.destroy();
              fail(
                capIsBudget
                  ? new FetchError("budget_exhausted", "Audit byte budget exhausted")
                  : new FetchError("too_large", `Response exceeds ${limits.maxBytes} bytes`),
              );
              return;
            }
            chunks.push(chunk);
          });
          source.on("end", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolvePromise({ status, headers, body: Buffer.concat(chunks) });
          });
          source.on("error", (error) => fail(new FetchError("network", `Body error: ${error.message}`)));
          res.on("error", (error) => fail(new FetchError("network", `Body error: ${error.message}`)));
        },
      );
      req.on("error", (error: NodeJS.ErrnoException) => {
        fail(new FetchError("network", error.code ? `${error.code}: ${error.message}` : error.message));
      });
      req.end();
    });
  }

  async function fetch(startUrl: string, limits: FetchLimits, budget: FetchBudget): Promise<FetchResult> {
    const redirects: SafeResponse["redirects"] = [];
    let current: URL;
    try {
      current = parseUrl(startUrl);
    } catch (error) {
      return { ok: false, failure: { kind: "invalid_url", message: (error as Error).message, url: startUrl } };
    }

    for (;;) {
      const started = Date.now();
      const entry: FetchLogEntry = { url: current.href, outcome: "ok", status: null, bytes: 0, ms: 0, ip: null, error: null };
      try {
        assertAllowedTarget(current);
        if (budget.requests >= budget.maxRequests) throw new FetchError("budget_exhausted", "Audit request budget exhausted");
        if (Date.now() >= budget.deadline) throw new FetchError("budget_exhausted", "Audit time budget exhausted");
        if (budget.bytes >= budget.maxTotalBytes) throw new FetchError("budget_exhausted", "Audit byte budget exhausted");
        budget.requests += 1;

        const ip = await resolvePublicAddress(bareHostname(current), resolve);
        entry.ip = ip;
        const raw = await requestOnce(current, ip, limits, budget);
        budget.bytes += raw.body.length;
        entry.status = raw.status;
        entry.bytes = raw.body.length;
        entry.ms = Date.now() - started;

        if (REDIRECT_STATUSES.has(raw.status)) {
          entry.outcome = "redirect";
          budget.log.push(entry);
          const location = raw.headers.location;
          if (!location) throw new FetchError("invalid_url", `Redirect ${raw.status} without Location`);
          if (redirects.length >= MAX_REDIRECTS) throw new FetchError("too_many_redirects", `More than ${MAX_REDIRECTS} redirects`);
          redirects.push({ url: current.href, status: raw.status, location });
          current = parseUrl(location, current);
          continue;
        }

        budget.log.push(entry);
        return {
          ok: true,
          response: {
            url: current.href,
            status: raw.status,
            headers: raw.headers,
            contentType: raw.headers["content-type"] ?? null,
            body: raw.body,
            redirects,
            ip,
          },
        };
      } catch (error) {
        const failure: FetchFailure =
          error instanceof FetchError
            ? { kind: error.kind, message: error.message, url: current.href }
            : { kind: "network", message: error instanceof Error ? error.message : String(error), url: current.href };
        // A redirect entry is already logged; log failures that happened on this hop only once.
        if (budget.log.at(-1) !== entry) {
          entry.outcome = failure.kind;
          entry.error = failure.message.slice(0, 300);
          entry.ms = Date.now() - started;
          budget.log.push(entry);
        }
        return { ok: false, failure };
      }
    }
  }

  return { fetch };
}

export type SafeFetcher = ReturnType<typeof createSafeFetcher>;
