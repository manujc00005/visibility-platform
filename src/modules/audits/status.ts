import type { FieldRating } from "@/modules/audits/crux";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { AuditFacts, Category, Severity } from "@/modules/audits/rules";

/**
 * Traffic-light view of an audit for the operator's screen. Pure functions: they only
 * classify stored facts and findings, they never invent a global score (B06).
 *
 * Two different questions get two different colourings:
 * - priority of a finding: critical = red, important = amber, optional improvement = blue;
 * - quality of a measured metric: good = green, needs improvement = amber, poor = red.
 *
 * Texts come from the catalog of the requested language, Spanish by default (D007). The
 * thresholds live in `thresholds.ts`, which holds no text and can be imported anywhere.
 */
export { METRIC_THRESHOLDS, rateMetric, type MetricName } from "@/modules/audits/thresholds";

export type Tone = "good" | "fair" | "bad" | "info" | "neutral";

export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "bad", warning: "fair", info: "info" };

export const RATING_TONE: Record<FieldRating, Tone> = { good: "good", needs_improvement: "fair", poor: "bad" };

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Categories whose checks need the home page content. */
const CONTENT_CATEGORIES: Category[] = ["metadata", "headings", "links", "structured_data", "social", "mobile"];

export interface CategoryStatus {
  category: Category;
  label: string;
  tone: Tone;
  verdict: string;
  count: number;
  /** First finding of the category, to link the tile to it. */
  firstFindingId: string | null;
}

interface FindingLike {
  id: string;
  severity: Severity;
  category: string;
}

export function isCategoryChecked(category: Category, facts: AuditFacts | null): boolean {
  if (!facts) return false;
  const readable = facts.page.kind === "fetched" && facts.page.result.status < 400 && facts.page.result.facts !== null;
  if (CONTENT_CATEGORIES.includes(category)) return readable;
  if (category === "performance") return facts.performance.status === "ok" || facts.fieldData?.status === "ok";
  return true;
}

/** One tile per area: red if any critical, amber if any important, blue if only optional, green if clean. */
export function categoryStatuses(findings: FindingLike[], facts: AuditFacts | null, locale: Locale = DEFAULT_LOCALE): CategoryStatus[] {
  const { category: categoryLabels, verdict } = getMessages(locale).audits.labels;
  return (Object.keys(categoryLabels) as Category[]).map((category) => {
    const related = findings.filter((f) => f.category === category);
    const base = { category, label: categoryLabels[category], count: related.length, firstFindingId: related[0]?.id ?? null };
    if (related.length === 0) {
      return isCategoryChecked(category, facts)
        ? { ...base, tone: "good" as const, verdict: verdict.good }
        : { ...base, tone: "neutral" as const, verdict: verdict.unchecked };
    }
    const worst = related.reduce((a, b) => (SEVERITY_RANK[b.severity] < SEVERITY_RANK[a.severity] ? b : a)).severity;
    return { ...base, tone: SEVERITY_TONE[worst], verdict: verdict[worst] };
  });
}

/** Headline for the whole audit, driven by the most severe finding (not a score). */
export function auditHeadline(counts: Record<Severity, number>, locale: Locale = DEFAULT_LOCALE): { tone: Tone; title: string; detail: string } {
  const t = getMessages(locale).audits.headline;
  if (counts.critical > 0) return { tone: "bad", title: t.critical(counts.critical), detail: t.criticalDetail };
  if (counts.warning > 0) return { tone: "fair", title: t.warning(counts.warning), detail: t.warningDetail };
  return {
    tone: "good",
    title: counts.info > 0 ? t.goodWithInfo : t.goodClean,
    detail: counts.info > 0 ? t.infoDetail(counts.info) : t.cleanDetail,
  };
}
