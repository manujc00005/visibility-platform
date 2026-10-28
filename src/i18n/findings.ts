/**
 * Translation of stored audit findings at display time (SPEC «Contrato de hallazgos», D014).
 *
 * Findings are stored in Spanish when the audit runs (`title`, `recommendation`, `evidence`).
 * In Spanish the stored texts are returned untouched. In another language a template keyed
 * by `ruleId` is used; dynamic titles (a status code, a count, a length, a metric) take their
 * values from the facts of that same audit, never from prose and never from another audit.
 * Anything the catalog cannot resolve falls back to the stored texts and says so.
 *
 * T002 defines the contract and the resolution rules; T005 fills the per-rule catalogs.
 */
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getFindingCatalog } from "@/i18n/messages/findings";
import type { AuditFacts } from "@/modules/audits/rules";

export interface FindingTextInput {
  ruleId: string;
  title: string;
  recommendation: string;
}

/** Facts and rules version stored with the audit the finding belongs to. */
export interface FindingContext {
  facts: AuditFacts | null | undefined;
  rulesVersion: string | null | undefined;
}

export interface FindingText {
  title: string;
  recommendation: string;
  /** True when the stored (Spanish) texts are shown because the catalog could not resolve them. */
  fallback: boolean;
}

/** Rules versions whose facts the parameter adapters know how to read. */
export const SUPPORTED_RULES_VERSIONS: readonly string[] = ["2026-10-26.1"];

export type FindingParams = Record<string, string | number | boolean>;

/**
 * A rule's texts in one language. Static rules give strings. Dynamic rules and variants give
 * functions and a `params` adapter that reads the stored facts; the adapter returns `null`
 * when a value it needs is missing (absence is not zero), which forces the fallback.
 */
export type FindingTemplate =
  | { title: string; recommendation: string }
  | {
      params: (facts: AuditFacts, locale: Locale) => FindingParams | null;
      title: string | ((params: FindingParams) => string);
      recommendation: string | ((params: FindingParams) => string);
    };

export type FindingCatalog = Readonly<Partial<Record<string, FindingTemplate>>>;

export function findingText(
  finding: FindingTextInput,
  locale: Locale,
  context?: FindingContext,
  catalog: FindingCatalog = getFindingCatalog(locale),
): FindingText {
  const stored: FindingText = { title: finding.title, recommendation: finding.recommendation, fallback: false };
  if (locale === DEFAULT_LOCALE) return stored;
  const template = catalog[finding.ruleId];
  if (!template) return { ...stored, fallback: true };
  if (!("params" in template)) return { title: template.title, recommendation: template.recommendation, fallback: false };

  const facts = context?.facts;
  const version = context?.rulesVersion;
  if (!facts || !version || !SUPPORTED_RULES_VERSIONS.includes(version)) return { ...stored, fallback: true };
  const params = template.params(facts, locale);
  if (params === null) return { ...stored, fallback: true };
  return {
    title: typeof template.title === "function" ? template.title(params) : template.title,
    recommendation: typeof template.recommendation === "function" ? template.recommendation(params) : template.recommendation,
    fallback: false,
  };
}
