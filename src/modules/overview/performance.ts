import { findingText, type FindingContext } from "@/i18n/findings";
import { formatDate } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { sameMethodology, SCORE_NOISE, speedMethodology } from "@/modules/audits/evolution";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import { auditLabels } from "@/modules/audits/presentation";
import type { FieldRating } from "@/modules/audits/crux";
import { rateMetric, RATING_TONE, type Tone } from "@/modules/audits/status";
import { fieldRating } from "@/modules/overview/performance-answer";
import { auditAttempt, splitAudits, staleInfo, type Attempt, type AuditInput, type BlockState, type Change, type FindingLike, type Stale } from "@/modules/overview/types";

/**
 * Mobile speed as Google's PageSpeed Insights measured it (lab, simulated phone), kept apart
 * from real visitors (Chrome UX Report). The verdict and its tone come from real visitors
 * when the Chrome UX Report has them (worst of LCP, INP and CLS) and from the lab score
 * otherwise; the lab score keeps its own tone in `scoreTone`. Changes are reported only between the result and
 * the completed audit immediately before it, with the same strategy and Lighthouse major.
 * Texts come from the catalog of `locale` (Spanish by default); the top speed finding is
 * translated with the facts of the same audit (SPEC «Contrato de hallazgos»).
 */
export interface PerformanceSummary {
  state: BlockState;
  /** Lighthouse mobile performance score, only when really measured. */
  score: number | null;
  /** Tone of the verdict: real visitors when measured, else the lab score. */
  tone: Tone;
  /** Tone of the lab score itself, for the figure. */
  scoreTone: Tone;
  verdict: string;
  /** Rating from real visitors, when the Chrome UX Report has it. */
  visitors: FieldRating | null;
  /** «Tus visitantes reales ven tu web rápida.» when `visitors` decides the verdict. */
  visitorsLine: string | null;
  change: Change | null;
  /** Why there is no change line although an earlier audit exists. */
  comparisonNote: string | null;
  measuredAt: Date | null;
  reason: string | null;
  /** Most important speed finding of the result audit, in the interface language. */
  topIssue: string | null;
  /** True when `topIssue` is the stored Spanish text because it could not be translated. */
  topIssueOriginal: boolean;
  attempt: Attempt | null;
  stale: Stale | null;
  auditId: string | null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function measured(perf: PerformanceResult | undefined): perf is PerformanceResult & { score: number } {
  return perf?.status === "ok" && typeof perf.score === "number";
}

/** Change between two lab measurements, or why they cannot be compared. */
export function compareScores(
  latest: PerformanceResult,
  previous: PerformanceResult | undefined,
  locale: Locale = DEFAULT_LOCALE,
): { change: Change | null; note: string | null } {
  const t = getMessages(locale).overview.performance;
  if (!measured(latest)) return { change: null, note: null };
  if (!measured(previous)) return { change: null, note: t.noComparisonPrevious };
  // Same definition as the chart segments (D019): strategy and known Lighthouse major.
  if (!sameMethodology(speedMethodology(latest), speedMethodology(previous))) {
    return { change: null, note: t.noComparisonVersion };
  }
  const diff = latest.score - previous.score;
  if (diff >= SCORE_NOISE) return { change: { direction: "better", text: t.change(signed(diff)) }, note: null };
  if (diff <= -SCORE_NOISE) return { change: { direction: "worse", text: t.change(signed(diff)) }, note: null };
  return { change: { direction: "same", text: t.noChange }, note: null };
}

const PERIOD_DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };

/** "del 27 sept 2026 al 24 oct 2026" from the CrUX ISO dates; null when absent or unreadable. */
export function fieldPeriod(period: { firstDate: string; lastDate: string } | null | undefined, locale: Locale = DEFAULT_LOCALE): string | null {
  if (!period) return null;
  const from = new Date(`${period.firstDate}T00:00:00Z`);
  const to = new Date(`${period.lastDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return getMessages(locale).overview.performance.period(formatDate(from, locale, PERIOD_DATE), formatDate(to, locale, PERIOD_DATE));
}

/** `findings`: findings of the latest completed audit (any order is fine; they come sorted). */
export function summarizePerformance(audits: AuditInput[], findings: FindingLike[], now: Date, locale: Locale = DEFAULT_LOCALE): PerformanceSummary {
  const t = getMessages(locale).overview.performance;
  const { result, previous, pending } = splitAudits(audits);
  const base: PerformanceSummary = {
    state: "no_data",
    score: null,
    tone: "neutral",
    scoreTone: "neutral",
    verdict: t.notMeasuredVerdict,
    visitors: null,
    visitorsLine: null,
    change: null,
    comparisonNote: null,
    measuredAt: result?.startedAt ?? null,
    reason: null,
    topIssue: null,
    topIssueOriginal: false,
    attempt: result ? auditAttempt(pending, locale) : null,
    stale: staleInfo(result?.startedAt ?? null, now, locale),
    auditId: result?.id ?? null,
  };

  if (!result) {
    if (pending?.status === "running") return { ...base, state: "analyzing", verdict: t.analyzing, reason: t.analyzingReason };
    if (pending?.status === "failed") return { ...base, state: "error", verdict: t.error, reason: t.errorReason };
    return { ...base, reason: t.firstAudit };
  }

  const perf = result.facts?.performance;
  // The finding belongs to the result audit: its own facts and rules version give the context.
  const context: FindingContext = { facts: result.facts, rulesVersion: result.rulesVersion ?? null };
  const top = findings.find((f) => f.category === "performance");
  const topText = top ? findingText(top, locale, context) : null;
  const topIssue = topText?.title ?? null;
  const topIssueOriginal = topText?.fallback ?? false;
  if (!perf || !measured(perf)) {
    const status = perf && perf.status !== "ok" ? perf.status : "error";
    return { ...base, state: status === "not_configured" ? "not_configured" : "partial", reason: t.notMeasured[status], topIssue, topIssueOriginal };
  }

  const lab = rateMetric("score", perf.score);
  const visitors = fieldRating(result.facts?.fieldData);
  const rating = visitors ?? lab;
  const { change, note } = compareScores(perf, previous?.facts?.performance, locale);
  return {
    ...base,
    state: "ok",
    score: perf.score,
    tone: RATING_TONE[rating],
    scoreTone: RATING_TONE[lab],
    verdict: auditLabels(locale).rating[rating],
    visitors,
    visitorsLine: visitors ? getMessages(locale).performancePage.answer.visitorsOnly[visitors] : null,
    change,
    comparisonNote: previous ? note : null,
    topIssue,
    topIssueOriginal,
  };
}
