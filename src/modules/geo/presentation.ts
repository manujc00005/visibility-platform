import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { es } from "@/i18n/messages/es";
import type { Fraction } from "@/modules/geo/metrics";

/**
 * GEO labels by interface language. Server side only: it reads the catalog, so Client
 * Components receive their labels by props instead of importing this module (D015).
 */
export type GeoLabels = Messages["geo"]["labels"];

export function geoLabels(locale: Locale = DEFAULT_LOCALE): GeoLabels {
  return getMessages(locale).geo.labels;
}

/** Spanish provider labels for the HTML/PDF report, which stays in Spanish (D006). */
export const PROVIDER_LABELS = es.geo.labels.provider;

/** Below this denominator a percentage says more than the sample does (feature 013, D004). */
export const MIN_PERCENT_SAMPLE = 3;

/**
 * "3 de 8 (38 %)": the percentage only from `MIN_PERCENT_SAMPLE` observations, so one answer
 * never reads as "100 %". Never "0 %" for "no data".
 */
export function fraction(value: Fraction, locale: Locale = DEFAULT_LOCALE): string {
  const t = geoLabels(locale);
  if (value.n === 0) return t.noData;
  if (value.n < MIN_PERCENT_SAMPLE) return t.fractionSmall(value.k, value.n);
  return t.fraction(value.k, value.n, Math.round((value.k / value.n) * 100));
}
