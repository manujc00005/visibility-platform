import { env } from "@/config/env";
import { AUDIT_USER_AGENT, type CollectDeps } from "@/modules/audits/collect";
import { createSafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { runCrux } from "@/modules/audits/crux";
import { runPageSpeed } from "@/modules/audits/pagespeed";

/** Production wiring: system DNS, real network, PageSpeed and CrUX with the configured keys. */
export function createAuditDeps(): CollectDeps {
  const fetcher = createSafeFetcher({ userAgent: AUDIT_USER_AGENT });
  return {
    fetcher,
    pageSpeed: (url) => runPageSpeed(url, { apiKey: env().PAGESPEED_API_KEY }),
    // One Google Cloud key can serve both APIs; CRUX_API_KEY overrides it.
    fieldData: (url) => runCrux(url, { apiKey: env().CRUX_API_KEY ?? env().PAGESPEED_API_KEY }),
  };
}
