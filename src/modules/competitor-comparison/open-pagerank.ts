import { z } from "zod";
import { parseAuthority, type AuthorityResult } from "@/modules/competitor-comparison/sites";

/**
 * Open PageRank, authority of many domains in one request (feature 011).
 * Contract read on 2026-10-31: https://keywordseverywhere.com/openpagerank/docs
 * Bodies of error responses are never read into a result, so neither they nor the key can be stored.
 */

export const ENDPOINT = "https://openpagerank.keywordseverywhere.com/v1/domains/bulk";
const TIMEOUT_MS = 15_000;

type CommonStatus = "not_configured" | "invalid_key" | "ip_not_allowed" | "quota_exceeded" | "error";

export interface AuthorityOptions {
  apiKey: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const envelopeSchema = z.object({ as_of: z.string(), results: z.array(z.unknown()) });
const entrySchema = z.object({ domain: z.string() });
const foundSchema = z.object({
  found: z.literal(true),
  open_page_rank: z.number().finite().min(0).max(10),
  rank: z.number().int().positive().nullish(),
  referring_domains: z.number().int().nonnegative().nullish(),
});
const notFoundSchema = z.object({ found: z.literal(false), open_page_rank: z.null().optional() });
const errorBodySchema = z.object({ error: z.object({ type: z.string() }) });

function statusOf(status: number, body: unknown): CommonStatus {
  if (status === 401) return "invalid_key";
  if (status === 429) return "quota_exceeded";
  if (status === 403 && errorBodySchema.safeParse(body).data?.error.type === "address_error") return "ip_not_allowed";
  return "error";
}

/** Exact domain first, else the longest parent: the provider reduces hosts to their registered domain. */
function resultFor(requested: string, entries: { domain: string; raw: unknown }[]): { domain: string; raw: unknown } | null {
  const matching = entries.filter(({ domain }) => domain === requested || requested.endsWith(`.${domain}`));
  if (matching.length === 0) return null;
  const longest = Math.max(...matching.map(({ domain }) => domain.length));
  const best = matching.filter(({ domain }) => domain.length === longest);
  const contradictory = new Set(best.map(({ raw }) => JSON.stringify(raw))).size > 1;
  return contradictory ? null : best[0]!;
}

function toResult(requested: string, match: { domain: string; raw: unknown } | null, asOf: string): AuthorityResult {
  const failed: AuthorityResult = { status: "error", requestedDomain: requested };
  if (!match) return failed;
  const matched = { requestedDomain: requested, effectiveDomain: match.domain, scope: "registered_domain" as const, asOf };
  const found = foundSchema.safeParse(match.raw);
  if (found.success) {
    const { open_page_rank: score, rank, referring_domains: referringDomains } = found.data;
    return parseAuthority({ status: "ok", ...matched, score, rank: rank ?? null, referringDomains: referringDomains ?? null }) ?? failed;
  }
  if (notFoundSchema.safeParse(match.raw).success) return parseAuthority({ status: "not_found", ...matched }) ?? failed;
  return failed;
}

export async function fetchAuthority(domains: readonly string[], options: AuthorityOptions): Promise<Map<string, AuthorityResult>> {
  const requested = [...new Set(domains)];
  const everyone = (status: CommonStatus) => new Map(requested.map((domain) => [domain, { status, requestedDomain: domain }]));
  if (!options.apiKey) return everyone("not_configured");
  if (requested.length === 0) return new Map();
  try {
    const response = await (options.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ domains: requested, include_history: false }),
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return everyone(statusOf(response.status, body));
    const envelope = envelopeSchema.safeParse(body);
    if (!envelope.success) return everyone("error");
    const entries = envelope.data.results.flatMap((raw) => {
      const entry = entrySchema.safeParse(raw);
      return entry.success ? [{ domain: entry.data.domain.toLowerCase(), raw }] : [];
    });
    return new Map(requested.map((domain) => [domain, toResult(domain, resultFor(domain, entries), envelope.data.as_of)]));
  } catch {
    return everyone("error");
  }
}
