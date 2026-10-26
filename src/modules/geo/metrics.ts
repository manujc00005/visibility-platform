import type { Mentions } from "@/modules/geo/detection";
import type { PromptIntent } from "@/modules/geo/prompt-suggestions";

/**
 * Metrics of one measurement, as plain fractions (k of n). No significance language, no
 * averaging across surfaces. Three distinct stages (Codex M03): a capture was completed,
 * the answer had content, and the answer mentioned the brand. Branded questions (which
 * name the brand) are reported apart and excluded from presence and share of voice.
 */

export interface MetricsObservation {
  promptId: string;
  repetition: number;
  status: "pending" | "submitted" | "completed" | "failed" | "uncertain";
  answerPresent: boolean | null;
  mentions: Mentions | null;
  ownCited: boolean | null;
  competitorsCited: string[] | null;
}

export interface Fraction {
  k: number;
  n: number;
}

export interface GeoMetrics {
  /** Observations completed / scheduled. */
  capture: Fraction;
  /** Completed observations with a non-empty answer / completed. */
  answers: Fraction;
  /** Non-branded answers mentioning the brand / non-branded answers. */
  brandPresence: Fraction;
  /** Non-branded answers citing an own URL / non-branded answers. */
  citationRate: Fraction;
  /** Non-branded questions with at least one brand mention / questions with at least one answer. */
  promptCoverage: Fraction;
  /** Branded answers mentioning the brand / branded answers. */
  branded: Fraction;
  /** Mentions per brand in non-branded answers (one per answer). Null when nobody was mentioned. */
  shareOfVoice: { total: number; entries: { id: string; name: string; k: number }[] } | null;
  perPrompt: {
    promptId: string;
    text: string;
    intent: PromptIntent;
    scheduled: number;
    captured: number;
    answered: number;
    brandMentions: number;
    ownCitations: number;
    competitorMentions: Record<string, number>;
  }[];
}

export function computeGeoMetrics(
  config: { prompts: { id: string; text: string; intent: PromptIntent }[]; competitors: { id: string; name: string }[] },
  observations: MetricsObservation[],
): GeoMetrics {
  const intentOf = new Map(config.prompts.map((p) => [p.id, p.intent]));
  const completed = observations.filter((o) => o.status === "completed");
  const answered = completed.filter((o) => o.answerPresent === true);
  const nonBranded = answered.filter((o) => intentOf.get(o.promptId) !== "branded");
  const branded = answered.filter((o) => intentOf.get(o.promptId) === "branded");

  const perPrompt = config.prompts.map((prompt) => {
    const own = observations.filter((o) => o.promptId === prompt.id);
    const ownAnswered = own.filter((o) => o.status === "completed" && o.answerPresent === true);
    return {
      promptId: prompt.id,
      text: prompt.text,
      intent: prompt.intent,
      scheduled: own.length,
      captured: own.filter((o) => o.status === "completed").length,
      answered: ownAnswered.length,
      brandMentions: ownAnswered.filter((o) => o.mentions?.brand).length,
      ownCitations: ownAnswered.filter((o) => o.ownCited).length,
      competitorMentions: Object.fromEntries(
        config.competitors.map((c) => [c.id, ownAnswered.filter((o) => o.mentions?.competitors[c.id]).length]),
      ),
    };
  });

  const sovEntries = [
    { id: "brand", name: "Tu marca", k: nonBranded.filter((o) => o.mentions?.brand).length },
    ...config.competitors.map((c) => ({ id: c.id, name: c.name, k: nonBranded.filter((o) => o.mentions?.competitors[c.id]).length })),
  ];
  const sovTotal = sovEntries.reduce((sum, e) => sum + e.k, 0);
  const nonBrandedPrompts = perPrompt.filter((p) => p.intent !== "branded" && p.answered > 0);

  return {
    capture: { k: completed.length, n: observations.length },
    answers: { k: answered.length, n: completed.length },
    brandPresence: { k: nonBranded.filter((o) => o.mentions?.brand).length, n: nonBranded.length },
    citationRate: { k: nonBranded.filter((o) => o.ownCited).length, n: nonBranded.length },
    promptCoverage: { k: nonBrandedPrompts.filter((p) => p.brandMentions > 0).length, n: nonBrandedPrompts.length },
    branded: { k: branded.filter((o) => o.mentions?.brand).length, n: branded.length },
    shareOfVoice: sovTotal > 0 ? { total: sovTotal, entries: sovEntries } : null,
    perPrompt,
  };
}
