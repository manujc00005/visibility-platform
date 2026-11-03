import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { Fraction } from "@/modules/geo/metrics";
import type { AiSummary } from "@/modules/overview/ai";
import type { PerformanceSummary } from "@/modules/overview/performance";
import type { SeoSummary } from "@/modules/overview/seo";
import { staleInfo } from "@/modules/overview/types";
import type { SearchConsoleSummary } from "@/modules/search-console/summary";

/**
 * The owner's overview (feature 023): which areas have a result, the one-line situation above
 * the cards and the reason of each pending row. All of it reads the same summaries as the cards
 * (D003): nothing here measures, compares or adds areas up; it only puts each card's state into
 * words. Pure.
 */

export type Area = "performance" | "technical" | "ranking" | "ai";

/** Card order, also the order of the situation line and of the pending list. */
export const AREAS: readonly Area[] = ["performance", "technical", "ranking", "ai"];

export interface AreaSummaries {
  performance: PerformanceSummary;
  seo: SeoSummary;
  gsc: SearchConsoleSummary;
  ai: AiSummary;
}

/** A speed card needs a score. Also the type guard the page renders the card with. */
export function isScored(p: PerformanceSummary): p is PerformanceSummary & { score: number } {
  return p.score !== null;
}

/** An AI card needs evaluated questions. Also the type guard the page renders the card with. */
export function isEvaluated(a: AiSummary): a is AiSummary & { coverage: Fraction } {
  return a.coverage !== null && a.coverage.n > 0;
}

/** A full card needs a result; anything else is a row of the "Pendiente de medir" list. */
export function hasResult(area: Area, s: AreaSummaries): boolean {
  switch (area) {
    case "performance":
      return isScored(s.performance);
    case "technical":
      // The technical card shows counts, and `summarizeTechnicalCard` has counts exactly when there is a headline.
      return s.seo.headline !== null;
    case "ranking":
      // A measured zero ("empty") is a result; a connection without figures is not.
      return (s.gsc.state === "ok" && s.gsc.totals !== null) || s.gsc.state === "empty";
    case "ai":
      return isEvaluated(s.ai);
  }
}

type Texts = ReturnType<typeof getMessages>["overview"];

function performanceFragment(p: PerformanceSummary, t: Texts["situation"]["performance"]): string {
  if (isScored(p)) return p.tone === "good" ? t.good : p.tone === "bad" ? t.bad : t.fair;
  if (p.state === "analyzing") return t.analyzing;
  // "partial": an audit ran but the speed test did not (quota, error, unreadable page). It was tried.
  if (p.state === "error" || p.state === "partial") return t.error;
  return t.notMeasured;
}

function technicalFragment(s: SeoSummary, t: Texts["situation"]["technical"]): string {
  if (s.headline !== null) {
    // A partial check never reads as good news (002 AC-013): it keeps only the severity it found.
    if (s.state === "partial") return s.tone === "bad" ? t.partialBad : s.tone === "fair" ? t.partialFair : t.partial;
    // Informational findings alone still read "Bien" in the audit (auditHeadline), so they read as good here too.
    return s.tone === "bad" ? t.bad : s.tone === "fair" ? t.fair : t.good;
  }
  if (s.state === "analyzing") return t.analyzing;
  if (s.state === "error") return t.error;
  return t.none;
}

function rankingFragment(g: SearchConsoleSummary, t: Texts["situation"]["ranking"]): string {
  if (g.state === "ok" && g.totals) return g.totals.impressions > 0 ? t.shown : t.notShownRecently;
  // Only zero impressions in both periods says Google does not show you yet (014 D003).
  if (g.state === "empty") return t.notYet;
  if (g.state === "error") return t.error;
  return t.notMeasured;
}

function aiFragment(a: AiSummary, t: Texts["situation"]["ai"]): string {
  if (isEvaluated(a)) {
    if (a.state !== "ok") return t.partial;
    return a.coverage.k === 0 ? t.none : a.coverage.k === a.coverage.n ? t.all : t.some;
  }
  if (a.state === "analyzing") return t.analyzing;
  if (a.state === "error") return t.error;
  return t.notMeasured;
}

export interface SituationFragment {
  area: Area;
  text: string;
  /** The card's own tone (D003), so the line can carry the icon next to the words. */
  tone: Tone;
}

/** The tone each card shows, read from the same summaries: never a judgement the card does not make. */
function areaTone(area: Area, s: AreaSummaries): Tone {
  switch (area) {
    case "performance":
      return isScored(s.performance) ? s.performance.tone : s.performance.state === "error" || s.performance.state === "partial" ? "bad" : "neutral";
    case "technical":
      // A partial check keeps only the severity it found; a neutral partial stays neutral (002 AC-013).
      if (s.seo.headline !== null) return s.seo.state === "partial" && s.seo.tone === "neutral" ? "neutral" : s.seo.tone;
      return s.seo.state === "error" ? "bad" : "neutral";
    case "ranking":
      // Figures carry no verdict (014 D002): only a failed read is a problem.
      return s.gsc.state === "error" ? "bad" : "neutral";
    case "ai":
      return s.ai.state === "error" ? "bad" : "neutral";
  }
}

/**
 * One fragment per area, in card order, or null when no area has a result (the empty state
 * speaks instead). A result older than 30 days says so, without the number: the card's notice
 * carries it.
 */
export function situationLine(s: AreaSummaries, now: Date, locale: Locale = DEFAULT_LOCALE): SituationFragment[] | null {
  if (!AREAS.some((area) => hasResult(area, s))) return null;
  const t = getMessages(locale).overview.situation;
  const stale: Record<Area, boolean> = {
    performance: isScored(s.performance) && s.performance.stale !== null,
    technical: s.seo.headline !== null && s.seo.stale !== null,
    ranking: hasResult("ranking", s) && staleInfo(s.gsc.capturedAt, now, locale) !== null,
    ai: isEvaluated(s.ai) && s.ai.stale !== null,
  };
  const text: Record<Area, string> = {
    performance: performanceFragment(s.performance, t.performance),
    technical: technicalFragment(s.seo, t.technical),
    ranking: rankingFragment(s.gsc, t.ranking),
    ai: aiFragment(s.ai, t.ai),
  };
  return AREAS.map((area) => ({ area, text: stale[area] ? t.stale(text[area]) : text[area], tone: areaTone(area, s) }));
}

export interface PendingRow {
  area: Area;
  /** The card's question, so the row reads as the same area. */
  title: string;
  /** Why there is no result yet, in the owner's voice. */
  reason: string;
}

/** The rows of the "Pendiente de medir" list: every area without a result, in card order. */
export function pendingRows(s: AreaSummaries, locale: Locale = DEFAULT_LOCALE): PendingRow[] {
  const t = getMessages(locale).overview;
  const p = t.pending;
  const reason: Record<Area, string> = {
    performance:
      s.performance.state === "analyzing" ? p.performance.analyzing : s.performance.state === "error" ? p.performance.error : s.performance.state === "partial" ? p.performance.partial : p.performance.waiting,
    technical: s.seo.state === "analyzing" ? p.technical.analyzing : s.seo.state === "error" ? p.technical.error : p.technical.waiting,
    ranking: s.gsc.state === "error" ? p.ranking.error : s.gsc.state === "no_data" ? p.ranking.noData : p.ranking.waiting,
    ai: s.ai.state === "analyzing" ? p.ai.analyzing : s.ai.state === "error" ? p.ai.error : p.ai.waiting,
  };
  const title: Record<Area, string> = {
    performance: t.cards.performance.title,
    technical: t.cards.seo.technical.title,
    ranking: t.cards.seo.title,
    ai: t.cards.ai.title,
  };
  return AREAS.filter((area) => !hasResult(area, s)).map((area) => ({ area, title: title[area], reason: reason[area] }));
}
