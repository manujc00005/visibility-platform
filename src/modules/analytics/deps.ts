import { env } from "@/config/env";
import { collectAnalytics } from "@/modules/analytics/collect";
import type { ClientOptions } from "@/modules/analytics/ga4";
import type { AnalyticsDeps } from "@/modules/analytics/service";
import { parseServiceAccount, type CredentialProblem } from "@/modules/search-console/credentials";

export type AnalyticsConfig = { state: "not_configured" } | { state: "invalid"; reason: CredentialProblem } | { state: "ready"; clientEmail: string };

/**
 * Same service account as Search Console (D002). The email is not secret: it is what the owner
 * adds as a viewer in the GA4 property.
 */
export function analyticsConfigFor(raw: string | undefined): AnalyticsConfig {
  const parsed = parseServiceAccount(raw);
  if (!parsed) return { state: "not_configured" };
  return parsed.ok ? { state: "ready", clientEmail: parsed.value.clientEmail } : { state: "invalid", reason: parsed.reason };
}

export function analyticsConfig(): AnalyticsConfig {
  return analyticsConfigFor(env().GSC_SERVICE_ACCOUNT_JSON);
}

/** Production wiring: real network, credential read on each call. An unusable one calls nothing and stores nothing (D007). */
export function createAnalyticsDeps(raw: () => string | undefined = () => env().GSC_SERVICE_ACCOUNT_JSON, options: ClientOptions = {}): AnalyticsDeps {
  return {
    collect(site) {
      const parsed = parseServiceAccount(raw());
      if (!parsed?.ok) return null;
      return collectAnalytics(parsed.value, site, options);
    },
  };
}
