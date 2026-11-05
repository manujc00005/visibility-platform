import { formatMs, formatNumber } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { rateFieldMetric, type FieldDataResult, type FieldRating } from "@/modules/audits/crux";
import { rateMetric } from "@/modules/audits/status";
import type { PerformanceResult } from "@/modules/audits/pagespeed";

const RANK: Record<FieldRating, number> = { good: 0, needs_improvement: 1, poor: 2 };

/** Worst rating among the real-visitor metrics that exist; null when there is nothing to judge. */
export function fieldRating(field: FieldDataResult | undefined): FieldRating | null {
  if (field?.status !== "ok" || !field.metrics) return null;
  const { lcpMs, inpMs, cls } = field.metrics;
  const ratings: FieldRating[] = [];
  if (lcpMs !== null) ratings.push(rateFieldMetric("lcp", lcpMs));
  if (inpMs !== null) ratings.push(rateFieldMetric("inp", inpMs));
  if (cls !== null) ratings.push(rateFieldMetric("cls", cls));
  return ratings.reduce<FieldRating | null>((worst, r) => (worst === null || RANK[r] > RANK[worst] ? r : worst), null);
}

/**
 * The one sentence under the performance verdict. It leads with real visitors (Chrome UX
 * Report) when that data exists and then gives the lab result, so the two are never left
 * unreconciled. Built only from values already on the page; null when neither is measured.
 */
export function performanceAnswer(perf: PerformanceResult | undefined, field: FieldDataResult | undefined, locale: Locale = DEFAULT_LOCALE): string | null {
  const t = getMessages(locale).performancePage.answer;
  const lcp = perf?.status === "ok" ? (perf.metrics?.lcpMs ?? null) : null;
  const lcpText = lcp === null ? null : formatMs(lcp, locale);
  const visitors = fieldRating(field);
  if (visitors === null) return lcpText === null ? null : t.labOnly(lcpText);
  if (lcpText === null) return t.visitorsOnly[visitors];
  const lab = RANK[rateMetric("lcp", lcp as number)];
  const relation = lab === RANK[visitors] ? "same" : lab > RANK[visitors] ? "worse" : "better";
  return t.visitorsAndLab[visitors](lcpText, relation);
}

/**
 * One plain line for a problem measured only in the lab (slow main content, layout shifts): when
 * real visitors rate that same metric as good, it says so with their own value. Null otherwise,
 * so no line appears without field data for that metric.
 */
export function fieldGoodLine(ruleId: string, field: FieldDataResult | undefined, locale: Locale = DEFAULT_LOCALE): string | null {
  if (field?.status !== "ok" || !field.metrics) return null;
  const t = getMessages(locale).performancePage.problems.fieldGood;
  if (ruleId === "lcp_slow") {
    const v = field.metrics.lcpMs;
    return v !== null && rateFieldMetric("lcp", v) === "good" ? t.lcp_slow(formatMs(v, locale)) : null;
  }
  if (ruleId === "cls_high") {
    const v = field.metrics.cls;
    return v !== null && rateFieldMetric("cls", v) === "good" ? t.cls_high(formatNumber(v, locale, { maximumFractionDigits: 2 })) : null;
  }
  return null;
}
