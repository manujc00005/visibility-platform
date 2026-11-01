import { env } from "@/config/env";
import { AUDIT_USER_AGENT, type CollectDeps } from "@/modules/audits/collect";
import { createSafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import { runCrux } from "@/modules/audits/crux";
import { runPageSpeed } from "@/modules/audits/pagespeed";

export interface AuditProviderConfig {
  pageSpeed: boolean;
  /** A dedicated Chrome UX Report key; without it the PageSpeed key serves both (feature 015). */
  crux: boolean;
}

/** Which Google keys are configured, never their values. */
export function auditProviderConfig(): AuditProviderConfig {
  const e = env();
  return { pageSpeed: Boolean(e.PAGESPEED_API_KEY), crux: Boolean(e.CRUX_API_KEY) };
}

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
