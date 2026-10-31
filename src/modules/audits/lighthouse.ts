import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { FieldRating } from "@/modules/audits/crux";
import type { LighthouseCategoryId, PerformanceResult } from "@/modules/audits/pagespeed";
import { rateMetric, RATING_TONE, type Tone } from "@/modules/audits/status";

/**
 * One Lighthouse category (SEO, accessibility, best practices) of the latest audit, ready to
 * show. Pure. A missing score is never a zero: an audit stored before these categories were
 * requested says "not measured", a failed PageSpeed run says why.
 */
export type LighthouseState = "ok" | "no_audit" | "not_measured" | "unavailable";

/** A failing check: our own name and meaning when we have them, else Lighthouse's title. */
export interface LighthouseCheckView {
  id: string;
  title: string;
  meaning: string | null;
}

export interface LighthouseView {
  category: LighthouseCategoryId;
  state: LighthouseState;
  score: number | null;
  tone: Tone;
  /** «Bueno» / «Mejorable» / «Malo», or the state label. */
  verdict: string;
  failing: LighthouseCheckView[];
  failingTotal: number;
  scored: number;
  /** Explanation for every state but "ok". */
  reason: string | null;
  /** True when a shown check keeps Lighthouse's Spanish title and the interface is not Spanish. */
  originalTexts: boolean;
}

export function lighthouseView(
  perf: PerformanceResult | null | undefined,
  category: LighthouseCategoryId,
  locale: Locale = DEFAULT_LOCALE,
): LighthouseView {
  const m = getMessages(locale);
  const t = m.lighthouse;
  const base: LighthouseView = {
    category,
    state: "no_audit",
    score: null,
    tone: "neutral",
    verdict: t.states.no_audit,
    failing: [],
    failingTotal: 0,
    scored: 0,
    reason: t.reasons.noAudit,
    originalTexts: false,
  };
  if (!perf) return base;
  if (perf.status !== "ok") return { ...base, state: "unavailable", verdict: t.states.unavailable, reason: t.reasons.unavailable[perf.status] };
  if (!perf.categories) return { ...base, state: "not_measured", verdict: t.states.not_measured, reason: t.reasons.notMeasured };
  const result = perf.categories[category];
  if (!result || result.score === null || result.scored === 0) return { ...base, state: "unavailable", verdict: t.states.unavailable, reason: t.reasons.unscored };
  const rating: FieldRating = rateMetric("score", result.score);
  const checks = t.checks as Record<string, { title: string; meaning: string } | undefined>;
  const failing = result.failing.map((check) => {
    const own = Object.hasOwn(checks, check.id) ? checks[check.id] : undefined;
    // Lighthouse titles are markdown: `[alt]` would show its backticks.
    return own ? { id: check.id, title: own.title, meaning: own.meaning } : { id: check.id, title: check.title.replaceAll("`", ""), meaning: null };
  });
  return {
    category,
    state: "ok",
    score: result.score,
    tone: RATING_TONE[rating],
    verdict: m.audits.labels.rating[rating],
    failing,
    failingTotal: result.failingTotal,
    scored: result.scored,
    reason: null,
    originalTexts: failing.some((check) => check.meaning === null) && perf.textLocale !== undefined && perf.textLocale !== locale,
  };
}
