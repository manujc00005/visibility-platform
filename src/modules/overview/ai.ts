import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { Fraction, GeoMetrics } from "@/modules/geo/metrics";
import { geoLabels, PROVIDER_LABELS } from "@/modules/geo/presentation";
import { staleInfo, type BlockState, type Change, type Stale } from "@/modules/overview/types";

/**
 * Presence in AI assistants from stored measurements. Units (D010, AC-012):
 * - presence is QUESTIONS: non-branded questions with at least one valid answer in which
 *   the brand appears (`promptCoverage`), never a share of all AI searches;
 * - citations are ANSWERS (`citationRate`).
 * `completed` means collection ended, not success: a run with no completed observation is
 * a failed attempt, not a result. Comparison only with the completed run immediately
 * before, under the rules of D012. Texts come from the catalog of `locale`, Spanish by
 * default (D007).
 */
export interface RunLike {
  id: string;
  status: "collecting" | "completed";
  provider: keyof typeof PROVIDER_LABELS;
  methodologyKey: string;
  createdAt: Date;
  completedAt: Date | null;
  metrics: GeoMetrics;
}

export interface AiAttempt {
  status: "running" | "failed";
  startedAt: Date;
  runId: string;
  text: string;
}

export interface AiSummary {
  state: BlockState;
  /** Brand present in k of n evaluated non-branded questions. Null without a result. */
  coverage: Fraction | null;
  /** Non-branded answers citing the website (unit: answers). */
  citing: Fraction | null;
  /** Answers collected / scheduled in the result run. */
  capture: Fraction | null;
  /** Questions frozen in the result run, all intents. */
  configured: number | null;
  /** Non-branded questions evaluated where the brand appears / does not appear. */
  covered: string[];
  uncovered: string[];
  /** Non-branded questions without any valid answer: not evaluated. */
  unanswered: string[];
  /** Questions naming the brand, reported apart (answers unit). */
  branded: { questions: number; mentioned: Fraction } | null;
  change: Change | null;
  comparisonNote: string | null;
  measuredAt: Date | null;
  provider: string | null;
  runId: string | null;
  attempt: AiAttempt | null;
  /** Shown when the result exists but nothing is configured for a new measurement. */
  setupNotice: string | null;
  activePrompts: number;
  reason: string | null;
  stale: Stale | null;
}

function nonBranded(m: GeoMetrics) {
  return m.perPrompt.filter((p) => p.intent !== "branded");
}

function evaluatedIds(m: GeoMetrics): string[] {
  return nonBranded(m)
    .filter((p) => p.answered > 0)
    .map((p) => p.promptId)
    .sort();
}

function usable(run: RunLike): boolean {
  return run.status === "completed" && run.metrics.capture.k > 0;
}

function captureComplete(m: GeoMetrics): boolean {
  return m.capture.n > 0 && m.capture.k === m.capture.n;
}

/**
 * The single definition of a complete result (D018), used for the state and for the
 * comparison: every scheduled observation collected, every collected one with a valid
 * answer (collecting is not answering), and at least one non-branded question evaluated.
 */
export function isCompleteResult(m: GeoMetrics): boolean {
  return captureComplete(m) && m.answers.k === m.answers.n && m.promptCoverage.n > 0;
}

/** Comparison between a result and the completed run immediately before it. */
export function compareRuns(latest: RunLike, previous: RunLike, locale: Locale = DEFAULT_LOCALE): { change: Change | null; note: string | null } {
  const t = getMessages(locale).overview.ai;
  if (latest.methodologyKey !== previous.methodologyKey) {
    return { change: null, note: t.noComparisonConfig };
  }
  if (!isCompleteResult(latest.metrics) || !isCompleteResult(previous.metrics)) {
    return { change: null, note: t.noComparisonIncomplete };
  }
  const a = latest.metrics.promptCoverage;
  const b = previous.metrics.promptCoverage;
  const sameSet = evaluatedIds(latest.metrics).join("|") === evaluatedIds(previous.metrics).join("|");
  if (!sameSet) {
    return { change: null, note: t.noComparisonQuestions };
  }
  const text = t.before(b.k, b.n);
  const diff = a.k / a.n - b.k / b.n;
  return { change: { direction: diff > 0 ? "better" : diff < 0 ? "worse" : "same", text }, note: null };
}

function attemptOf(run: RunLike, locale: Locale): AiAttempt {
  const t = getMessages(locale).overview.ai.attempt;
  return run.status === "collecting"
    ? { status: "running", startedAt: run.createdAt, runId: run.id, text: t.running }
    : { status: "failed", startedAt: run.createdAt, runId: run.id, text: t.failed };
}

/** Runs in any order. `activePrompts`: questions active today (does not change past denominators). */
export function summarizeAi(runs: RunLike[], activePrompts: number, now: Date, locale: Locale = DEFAULT_LOCALE): AiSummary {
  const t = getMessages(locale).overview.ai;
  const sorted = [...runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const resultIndex = sorted.findIndex(usable);
  const result = resultIndex >= 0 ? sorted[resultIndex]! : null;
  const newerAttempts = result ? sorted.slice(0, resultIndex) : sorted;
  const attempt = newerAttempts[0] ? attemptOf(newerAttempts[0], locale) : null;
  const base: AiSummary = {
    state: "no_data",
    coverage: null,
    citing: null,
    capture: null,
    configured: null,
    covered: [],
    uncovered: [],
    unanswered: [],
    branded: null,
    change: null,
    comparisonNote: null,
    measuredAt: null,
    provider: null,
    runId: null,
    attempt: null,
    setupNotice: null,
    activePrompts,
    reason: null,
    stale: null,
  };

  if (!result) {
    if (attempt?.status === "running") return { ...base, state: "analyzing", runId: attempt.runId, reason: t.firstRunning };
    if (attempt?.status === "failed") return { ...base, state: "error", runId: attempt.runId, reason: t.firstFailed };
    if (activePrompts === 0) return { ...base, state: "not_configured", reason: t.notConfigured };
    return { ...base, reason: t.firstRun };
  }

  const m = result.metrics;
  const questions = nonBranded(m);
  const evaluated = questions.filter((p) => p.answered > 0);
  const unanswered = questions.filter((p) => p.answered === 0).map((p) => p.text);
  const brandedPrompts = m.perPrompt.filter((p) => p.intent === "branded");
  const complete = isCompleteResult(m);
  const previous = sorted.slice(resultIndex + 1).find((r) => r.status === "completed") ?? null;
  const comparison = previous ? compareRuns(result, previous, locale) : { change: null, note: null };
  const measuredAt = result.completedAt ?? result.createdAt;

  let reason: string | null = null;
  if (m.promptCoverage.n === 0) reason = t.noValid;
  else if (!captureComplete(m)) reason = t.partialCapture;
  else if (unanswered.length > 0) reason = t.partialUnanswered(unanswered.length);
  else if (!complete) reason = t.partialEmpty(m.answers.n - m.answers.k);

  return {
    ...base,
    state: complete ? "ok" : "partial",
    coverage: m.promptCoverage,
    citing: m.citationRate,
    capture: m.capture,
    configured: m.perPrompt.length,
    covered: evaluated.filter((p) => p.brandMentions > 0).map((p) => p.text),
    uncovered: evaluated.filter((p) => p.brandMentions === 0).map((p) => p.text),
    unanswered,
    branded: brandedPrompts.length > 0 ? { questions: brandedPrompts.length, mentioned: m.branded } : null,
    change: comparison.change,
    comparisonNote: comparison.note,
    measuredAt,
    provider: geoLabels(locale).provider[result.provider],
    runId: result.id,
    attempt,
    setupNotice: activePrompts === 0 ? t.setupNotice : null,
    reason,
    stale: staleInfo(measuredAt, now, locale),
  };
}
