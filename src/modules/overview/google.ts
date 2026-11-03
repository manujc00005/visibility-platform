import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { SeoSummary } from "@/modules/overview/seo";
import { staleInfo, type Change } from "@/modules/overview/types";
import { displayDay, type SearchConsoleState, type SearchConsoleSummary } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";

/**
 * The two Google cards of the overview (feature 023, D001, which replaces 014 D001): what Search
 * Console measured, with no verdict (014 D002), and the technical health of the home page, with
 * the verdict scale of the audit. Pure over the summaries the overview already builds. Texts come
 * from the catalog of `locale`, Spanish by default (D007).
 */
export interface CardStatus {
  tone: Tone;
  label: string;
}

export interface CardNotice {
  kind: "running" | "failed" | "stale" | "info";
  text: string;
}

export type RankingHeadline =
  | { kind: "figures"; clicks: string; clicksUnit: string; impressions: string; impressionsUnit: string }
  | { kind: "text"; text: string };

export interface RankingCardSummary {
  state: SearchConsoleState;
  status: CardStatus;
  headline: RankingHeadline;
  /** Clicks against the previous 28 days (014 D002: the only directional signal). */
  change: Change | null;
  changeNote: string | null;
  line: string | null;
  notices: CardNotice[];
  source: string;
}

export interface TechnicalCardSummary {
  state: SeoSummary["state"];
  status: CardStatus;
  /** Null without an audit result: the page then shows a pending row instead of this card. */
  counts: { critical: number; warning: number } | null;
  change: Change | null;
  comparisonNote: string | null;
  reason: string | null;
  notices: CardNotice[];
  source: string;
}

/** Figures carry no verdict (D002): every ranking state is neutral but a failed read. */
const RANKING_TONE: Record<SearchConsoleState, Tone> = { ok: "neutral", empty: "neutral", no_data: "neutral", not_configured: "neutral", invalid_config: "neutral", error: "bad" };
const SEO_STATE_TONE: Record<Exclude<SeoSummary["state"], "ok">, Tone> = { not_configured: "neutral", no_data: "neutral", analyzing: "neutral", partial: "neutral", error: "bad" };

/**
 * Total over every Search Console state, although the overview only draws this card for "ok" and
 * "empty" (023 FR-003): the other states keep their status and text for any other reader.
 */
export function summarizeRankingCard(gsc: SearchConsoleSummary, now: Date, locale: Locale = DEFAULT_LOCALE): RankingCardSummary {
  const t = getMessages(locale).overview;
  const c = t.cards.seo;
  const period = gsc.period ? c.period(displayDay(gsc.period.start, locale), displayDay(gsc.period.end, locale)) : null;
  const status = (label: string): CardStatus => ({ tone: RANKING_TONE[gsc.state], label });
  const text = (value: string): RankingHeadline => ({ kind: "text", text: value });

  let ranking: Omit<RankingCardSummary, "notices" | "source">;
  if (gsc.state === "ok" && gsc.metrics && gsc.totals) {
    const m = gsc.metrics;
    ranking = {
      state: gsc.state,
      status: status(t.states.ok),
      headline: {
        kind: "figures",
        clicks: m.clicks.value,
        clicksUnit: c.clicks(Math.round(gsc.totals.clicks)),
        impressions: m.impressions.value,
        impressionsUnit: c.impressions(Math.round(gsc.totals.impressions)),
      },
      change: m.clicks.change,
      changeNote: m.clicks.change ? null : c.noPrevious,
      line: period,
    };
  } else if (gsc.state === "empty") {
    ranking = { state: gsc.state, status: status(c.noImpressionsLabel), headline: text(c.noImpressions), change: null, changeNote: null, line: period };
  } else if (gsc.state === "no_data") {
    ranking = { state: gsc.state, status: status(t.states.no_data), headline: text(c.pending), change: null, changeNote: null, line: c.noFetch };
  } else if (gsc.state === "error") {
    ranking = { state: gsc.state, status: status(t.states.error), headline: text(c.noResult), change: null, changeNote: null, line: c.fetchFailed };
  } else {
    // not_configured, invalid_config, or an "ok" without figures (cannot happen; never shown as measured).
    ranking = { state: gsc.state, status: status(t.states.not_configured), headline: text(c.pending), change: null, changeNote: null, line: c.notConnected };
  }

  const notices: CardNotice[] = [];
  if ((gsc.state === "ok" || gsc.state === "empty") && gsc.lastFailure) notices.push({ kind: "failed", text: c.lastAttemptFailed });
  const stale = staleInfo(gsc.capturedAt, now, locale);
  if (stale) notices.push({ kind: "stale", text: stale.text });
  const when = gsc.capturedAt ? displayDate(gsc.capturedAt, locale) : gsc.state === "error" ? c.noResultShort : c.notMeasuredShort;
  return { ...ranking, notices, source: c.source(when) };
}

export function summarizeTechnicalCard(seo: SeoSummary, locale: Locale = DEFAULT_LOCALE): TechnicalCardSummary {
  const t = getMessages(locale).overview;
  const c = t.cards.seo.technical;
  // A partial check keeps the severity it did find: "Mal (parcial)", never a neutral grey over critical problems.
  const status: CardStatus =
    seo.state === "ok"
      ? { tone: seo.tone, label: t.verdict[seo.tone] }
      : seo.state === "partial" && seo.tone !== "neutral"
        ? { tone: seo.tone, label: t.partial(t.verdict[seo.tone]) }
        : { tone: SEO_STATE_TONE[seo.state], label: t.states[seo.state] };

  const notices: CardNotice[] = [];
  if (seo.attempt) notices.push({ kind: seo.attempt.status === "running" ? "running" : "failed", text: seo.attempt.text });
  if (seo.stale) notices.push({ kind: "stale", text: seo.stale.text });
  const when = seo.auditedAt ? displayDate(seo.auditedAt, locale) : seo.state === "error" || seo.state === "analyzing" ? c.noResultShort : c.notAuditedShort;
  return {
    state: seo.state,
    status,
    counts: seo.headline ? { critical: seo.counts.critical, warning: seo.counts.warning } : null,
    change: seo.change,
    comparisonNote: seo.comparisonNote,
    reason: seo.reason,
    notices,
    source: c.source(when),
  };
}

/**
 * The sentence that opens the Google page: what Search Console measured, in words. Direction of
 * impressions and clicks against the previous 28 days, never a verdict (014 D002), and only what
 * the summary already holds; without figures it states why, as a status, not an instruction.
 */
export function searchAnswer(gsc: SearchConsoleSummary, locale: Locale = DEFAULT_LOCALE): string {
  const t = getMessages(locale).seoPage.answer;
  switch (gsc.state) {
    case "ok": {
      const shown = gsc.metrics?.impressions.change;
      const visits = gsc.metrics?.clicks.change;
      if (!shown || !visits) return t.noPrevious;
      const contrast = shown.direction !== "same" && visits.direction !== "same" && shown.direction !== visits.direction;
      return t.sentence(t.shown[shown.direction], t.visits[visits.direction], contrast);
    }
    case "empty":
      return t.empty;
    case "no_data":
      return t.noData;
    case "error":
      return t.error;
    default:
      return t.notConnected;
  }
}
