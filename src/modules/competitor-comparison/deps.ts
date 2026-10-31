import { env } from "@/config/env";
import { createAuditDeps } from "@/modules/audits/deps";
import { fetchAuthority } from "@/modules/competitor-comparison/open-pagerank";
import type { ComparisonDeps } from "@/modules/competitor-comparison/service";

/** What the page needs to know before offering a comparison. */
export function comparisonConfig(): { pageSpeed: boolean } {
  return { pageSpeed: Boolean(env().PAGESPEED_API_KEY) };
}

/** Production wiring: the audit's safe fetcher and Google keys, plus Open PageRank. */
export function createComparisonDeps(): ComparisonDeps {
  return {
    audit: createAuditDeps(),
    authority: (domains) => fetchAuthority(domains, { apiKey: env().OPEN_PAGERANK_API_KEY }),
    pageSpeedConfigured: comparisonConfig().pageSpeed,
  };
}
