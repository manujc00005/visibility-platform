import { env } from "@/config/env";
import { AUDIT_USER_AGENT, type CollectDeps } from "@/modules/audits/collect";
import { createSafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { runPageSpeed } from "@/modules/audits/pagespeed";

/** Production wiring: system DNS, real network, PageSpeed with the configured key. */
export function createAuditDeps(): CollectDeps {
  const fetcher = createSafeFetcher({ userAgent: AUDIT_USER_AGENT });
  return {
    fetcher,
    pageSpeed: (url) => runPageSpeed(url, { apiKey: env().PAGESPEED_API_KEY }),
  };
}
