import { env } from "@/config/env";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { AUDIT_USER_AGENT } from "@/modules/audits/collect";
import { createSafeFetcher } from "@/modules/audits/fetcher/safe-fetch";
import type { CompetitorDeps } from "@/modules/geo/competitors/service";
import { parseUsdToMicros } from "@/modules/geo/budget";
import { createDataForSeoClient } from "@/modules/geo/dataforseo";
import type { GeoDeps } from "@/modules/geo/service";

export interface GeoProviderStatus {
  dataforseo: { available: boolean; reason: string | null; budgetMicros: number | null; reportable: boolean };
}

/** What the operator can use right now, and why not when unavailable. */
export function geoProviderStatus(locale: Locale = DEFAULT_LOCALE): GeoProviderStatus {
  const e = env();
  const t = getMessages(locale).geo.providerStatus;
  const budgetMicros = parseUsdToMicros(e.GEO_MONTHLY_BUDGET_USD);
  const reason = !e.DATAFORSEO_LOGIN || !e.DATAFORSEO_PASSWORD ? t.missingCredentials : budgetMicros === null ? t.missingBudget : null;
  return { dataforseo: { available: reason === null, reason, budgetMicros, reportable: e.DATAFORSEO_REDISTRIBUTION_CONFIRMED } };
}

export function createGeoDeps(): GeoDeps {
  const e = env();
  return {
    dataforseo:
      e.DATAFORSEO_LOGIN && e.DATAFORSEO_PASSWORD
        ? createDataForSeoClient({ login: e.DATAFORSEO_LOGIN, password: e.DATAFORSEO_PASSWORD })
        : null,
    budgetCapMicros: parseUsdToMicros(e.GEO_MONTHLY_BUDGET_USD),
  };
}

/** Competitor discovery reads home pages through the same safe fetcher as the audit engine. */
export function createCompetitorDeps(): CompetitorDeps {
  return { fetcher: createSafeFetcher({ userAgent: AUDIT_USER_AGENT }) };
}
