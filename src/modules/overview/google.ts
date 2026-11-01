import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { Tone } from "@/modules/audits/status";
import type { SeoSummary } from "@/modules/overview/seo";
import { staleInfo, type Change } from "@/modules/overview/types";
import { displayDay, type SearchConsoleState, type SearchConsoleSummary } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";

/**
 * The «Visibilidad en Google» card (feature 014, D001): what Search Console measured comes
 * first and decides the status; the technical health of the home page is a labelled block
 * apart, with the verdict scale of the audit. Pure over the two summaries the overview
 * already builds. Texts come from the catalog of `locale`, Spanish by default (D007).
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

export interface GoogleCardSummary {
  ranking: {
    state: SearchConsoleState;
    status: CardStatus;
    headline: RankingHeadline;
    /** Clicks against the previous 28 days (D002: the only directional signal). */
    change: Change | null;
    changeNote: string | null;
    line: string | null;
  };
  technical: {
    title: string;
    status: CardStatus;
    counts: { critical: number; warning: number } | null;
    /** The audit verdict, or why there is none. */
    headline: string;
    change: Change | null;
    comparisonNote: string | null;
    reason: string | null;
  };
  notices: CardNotice[];
  source: string;
}

/** Figures carry no verdict (D002): every ranking state is neutral but a failed read. */
const RANKING_TONE: Record<SearchConsoleState, Tone> = { ok: "neutral", empty: "neutral", no_data: "neutral", not_configured: "neutral", invalid_config: "neutral", error: "bad" };
const SEO_STATE_TONE: Record<Exclude<SeoSummary["state"], "ok">, Tone> = { not_configured: "neutral", no_data: "neutral", analyzing: "neutral", partial: "neutral", error: "bad" };

export function summarizeGoogleCard(gsc: SearchConsoleSummary, seo: SeoSummary, now: Date, locale: Locale = DEFAULT_LOCALE): GoogleCardSummary {
  const t = getMessages(locale).overview;
  const c = t.cards.seo;
  const period = gsc.period ? c.period(displayDay(gsc.period.start, locale), displayDay(gsc.period.end, locale)) : null;
  const status = (label: string): CardStatus => ({ tone: RANKING_TONE[gsc.state], label });
  const text = (value: string): RankingHeadline => ({ kind: "text", text: value });

  let ranking: GoogleCardSummary["ranking"];
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

  // A partial check keeps the severity it did find: "Mal (parcial)", never a neutral grey over critical problems.
  const technicalStatus: CardStatus =
    seo.state === "ok"
      ? { tone: seo.tone, label: t.verdict[seo.tone] }
      : seo.state === "partial" && seo.tone !== "neutral"
        ? { tone: seo.tone, label: t.partial(t.verdict[seo.tone]) }
        : { tone: SEO_STATE_TONE[seo.state], label: t.states[seo.state] };
  const technical: GoogleCardSummary["technical"] = {
    title: c.technical.title,
    status: technicalStatus,
    counts: seo.headline ? { critical: seo.counts.critical, warning: seo.counts.warning } : null,
    headline: seo.headline?.title ?? (seo.state === "analyzing" ? c.technical.analyzing : seo.state === "error" ? c.technical.noResult : c.technical.noAudit),
    change: seo.change,
    comparisonNote: seo.comparisonNote,
    reason: seo.reason,
  };

  const notices: CardNotice[] = [];
  if ((gsc.state === "ok" || gsc.state === "empty") && gsc.lastFailure) notices.push({ kind: "failed", text: c.lastAttemptFailed });
  const rankingStale = staleInfo(gsc.capturedAt, now, locale);
  if (rankingStale) notices.push({ kind: "stale", text: c.staleRanking(rankingStale.days) });
  if (seo.attempt) notices.push({ kind: seo.attempt.status === "running" ? "running" : "failed", text: c.technical.prefix(seo.attempt.text) });
  if (seo.stale) notices.push({ kind: "stale", text: c.technical.stale(seo.stale.days) });

  const rankingPart = gsc.capturedAt ? displayDate(gsc.capturedAt, locale) : gsc.state === "error" ? c.noResultShort : c.notMeasuredShort;
  const technicalPart = seo.auditedAt ? displayDate(seo.auditedAt, locale) : seo.state === "error" || seo.state === "analyzing" ? c.noResultShort : c.notAuditedShort;
  return { ranking, technical, notices, source: c.source(rankingPart, technicalPart) };
}
