import type { FetchLogEntry } from "@/modules/audits/fetcher/safe-fetch";
import { formatMs as formatMsIn } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import { es } from "@/i18n/messages/es";
import type { Category, Severity } from "@/modules/audits/rules";

export type AuditLabels = Messages["audits"]["labels"];

/** Labels of the audit screens in one language, Spanish by default (D007). */
export function auditLabels(locale: Locale = DEFAULT_LOCALE): AuditLabels {
  return getMessages(locale).audits.labels;
}

/** Spanish constants for the HTML/PDF report, which stays in Spanish (D006). */
export const SEVERITY_LABELS: Record<Severity, string> = es.audits.labels.severity;
export const CATEGORY_LABELS: Record<Category, string> = es.audits.labels.category;
export const OUTCOME_LABELS: Record<FetchLogEntry["outcome"], string> = es.audits.labels.outcome;

export function formatMs(value: number | null, locale: Locale = DEFAULT_LOCALE): string {
  return formatMsIn(value, locale);
}
