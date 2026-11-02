import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { AiSummary } from "@/modules/overview/ai";
import type { PerformanceSummary } from "@/modules/overview/performance";
import type { SeoSummary } from "@/modules/overview/seo";
import { staleInfo } from "@/modules/overview/types";
import type { SearchConsoleSummary } from "@/modules/search-console/summary";

/**
 * The owner's overview (feature 023): which areas have a result, and the one-line situation
 * above the cards. Both read the same summaries as the cards (D003): nothing here measures,
 * compares or adds areas up; it only puts each card's state into words. Pure.
 */

export type Area = "performance" | "technical" | "ranking" | "ai";

/** Card order, also the order of the situation line. */
export const AREAS: readonly Area[] = ["performance", "technical", "ranking", "ai"];

export interface AreaSummaries {
  performance: PerformanceSummary;
  seo: SeoSummary;
  gsc: SearchConsoleSummary;
  ai: AiSummary;
}

/** A full card needs a result; anything else is a row of the "Pendiente de medir" list. */
export function hasResult(area: Area, s: AreaSummaries): boolean {
  switch (area) {
    case "performance":
      return s.performance.score !== null;
    case "technical":
      return s.seo.headline !== null;
    case "ranking":
      // A measured zero ("empty") is a result; a connection without figures is not.
      return (s.gsc.state === "ok" && s.gsc.totals !== null) || s.gsc.state === "empty";
    case "ai":
      return s.ai.coverage !== null && s.ai.coverage.n > 0;
  }
}

function performanceFragment(p: PerformanceSummary, t: Texts["performance"]): string {
  if (p.score !== null) return p.tone === "good" ? t.good : p.tone === "bad" ? t.bad : t.fair;
  if (p.state === "analyzing") return t.analyzing;
  if (p.state === "error") return t.error;
  return t.notMeasured;
}

function technicalFragment(s: SeoSummary, t: Texts["technical"]): string {
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

function rankingFragment(g: SearchConsoleSummary, t: Texts["ranking"]): string {
  if (g.state === "ok" && g.totals) return g.totals.impressions > 0 ? t.shown : t.notShownRecently;
  // Only zero impressions in both periods says Google does not show you yet (014 D003).
  if (g.state === "empty") return t.notYet;
  if (g.state === "error") return t.error;
  return t.notMeasured;
}

function aiFragment(a: AiSummary, t: Texts["ai"]): string {
  if (a.coverage && a.coverage.n > 0) {
    if (a.state !== "ok") return t.partial;
    return a.coverage.k === 0 ? t.none : a.coverage.k === a.coverage.n ? t.all : t.some;
  }
  if (a.state === "analyzing") return t.analyzing;
  if (a.state === "error") return t.error;
  return t.notMeasured;
}

type Texts = ReturnType<typeof getMessages>["overview"]["situation"];

/**
 * One fragment per area, in card order, or null when no area has a result (the empty state
 * speaks instead). A result older than 30 days says so.
 */
export function situationLine(s: AreaSummaries, now: Date, locale: Locale = DEFAULT_LOCALE): string[] | null {
  if (!AREAS.some((area) => hasResult(area, s))) return null;
  const t = getMessages(locale).overview.situation;
  const aged = (text: string, days: number | null) => (days === null ? text : t.stale(text, days));
  return [
    aged(performanceFragment(s.performance, t.performance), hasResult("performance", s) ? (s.performance.stale?.days ?? null) : null),
    aged(technicalFragment(s.seo, t.technical), hasResult("technical", s) ? (s.seo.stale?.days ?? null) : null),
    aged(rankingFragment(s.gsc, t.ranking), hasResult("ranking", s) ? (staleInfo(s.gsc.capturedAt, now, locale)?.days ?? null) : null),
    aged(aiFragment(s.ai, t.ai), hasResult("ai", s) ? (s.ai.stale?.days ?? null) : null),
  ];
}
