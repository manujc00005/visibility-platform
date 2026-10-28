/**
 * Interface formatters for dates, numbers, durations, sizes and region names, keyed by the
 * interface language (SPEC §9, D013). `es` → `es-ES`, `en` → `en-GB`; time zones are the
 * caller's (the existing code fixes `Europe/Madrid` or UTC per use). Pure: no I/O.
 */
import { intlTag, type Locale } from "@/i18n/locale";

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const regionNames = new Map<Locale, Intl.DisplayNames>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    // Default grouping, as `toLocaleString("es-ES")` did before 003: Spanish groups from five
    // digits («1234», «12.345»), English from four («1,234») (D007, D020).
    format = new Intl.NumberFormat(intlTag(locale), options);
    numberFormats.set(key, format);
  }
  return format;
}

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(intlTag(locale), options);
    dateFormats.set(key, format);
  }
  return format;
}

export function formatNumber(value: number, locale: Locale, options: Intl.NumberFormatOptions = {}): string {
  return numberFormat(locale, options).format(value);
}

/** Default: medium date («27 oct 2026» / «27 Oct 2026») in Europe/Madrid. */
export function formatDate(
  date: Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeZone: "Europe/Madrid" },
): string {
  return dateFormat(locale, options).format(date);
}

/** Medium date and short time in Europe/Madrid, as the workspace pages show today. */
export function formatDateTime(date: Date, locale: Locale): string {
  return formatDate(date, locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });
}

/**
 * Date and time with the runtime's default style and time zone, as the system status card
 * has always shown it («27/10/2026, 13:34:56»). Only for that operator card (D020).
 */
export function formatTimestamp(date: Date, locale: Locale): string {
  return date.toLocaleString(intlTag(locale));
}

/** Milliseconds as «1,7 s» / «1.7 s» from one second up, «850 ms» below; «—» when unknown. */
export function formatMs(value: number | null, locale: Locale): string {
  if (value === null) return "—";
  return value >= 1000 ? `${formatNumber(value / 1000, locale, { maximumFractionDigits: 1 })} s` : `${Math.round(value)} ms`;
}

export function formatBytes(value: number, locale: Locale): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${formatNumber(value / 1024, locale, { maximumFractionDigits: 1 })} KB`;
  return `${formatNumber(value / 1024 / 1024, locale, { maximumFractionDigits: 1 })} MB`;
}

/** Display name of an ISO 3166-1 alpha-2 region, or `undefined` when Intl has none. */
export function regionName(code: string, locale: Locale): string | undefined {
  let names = regionNames.get(locale);
  if (!names) {
    names = new Intl.DisplayNames([intlTag(locale)], { type: "region", fallback: "none" });
    regionNames.set(locale, names);
  }
  return names.of(code);
}
