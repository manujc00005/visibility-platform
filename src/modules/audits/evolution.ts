import type { FieldRating } from "@/modules/audits/crux";
import type { AuditFacts, Severity } from "@/modules/audits/rules";
import { auditHeadline, rateMetric, RATING_TONE, type Tone } from "@/modules/audits/status";

/**
 * Owner-friendly evolution of a website across its audits. Pure functions over stored
 * audits. Deliberately no composite "SEO score" (B06): the trend is told with the counts
 * of problems by severity and with Google's own speed score, which are real measurements.
 */
export interface AuditLike {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  facts: AuditFacts | null;
}

export interface EvolutionPoint {
  id: string;
  date: Date;
  counts: Record<Severity, number>;
  /** Lighthouse mobile performance score 0–100, when measured. */
  score: number | null;
  /** Lab LCP in ms, when measured. */
  lcpMs: number | null;
}

export type Direction = "better" | "same" | "worse";

export interface Indicator {
  label: string;
  value: string;
  tone: Tone;
  verdict: string;
  /** Change versus the previous completed audit, in plain words; null when there is no previous one. */
  change: { direction: Direction; text: string } | null;
}

export interface Evolution {
  /** Oldest first, completed audits only. */
  points: EvolutionPoint[];
  latest: EvolutionPoint | null;
  previous: EvolutionPoint | null;
  headline: { tone: Tone; title: string; detail: string } | null;
  /** One-line answer to "is it getting better?", null with fewer than two audits. */
  trend: { direction: Direction; tone: Tone; text: string } | null;
  indicators: Indicator[];
}

export function toPoint(audit: AuditLike): EvolutionPoint {
  const perf = audit.facts?.performance;
  const ok = perf?.status === "ok";
  return {
    id: audit.id,
    date: audit.startedAt,
    counts: { critical: audit.criticalCount, warning: audit.warningCount, info: audit.infoCount },
    score: ok ? perf.score : null,
    lcpMs: ok ? (perf.metrics?.lcpMs ?? null) : null,
  };
}

/** Lighthouse mobile scores vary this much between identical runs; smaller moves are noise. */
export const SCORE_NOISE = 10;

export const DIRECTION_TONE: Record<Direction, Tone> = { better: "good", same: "neutral", worse: "bad" };

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function problemsIndicator(latest: EvolutionPoint, previous: EvolutionPoint | null): Indicator {
  const urgent = latest.counts.critical + latest.counts.warning;
  const tone: Tone = latest.counts.critical > 0 ? "bad" : latest.counts.warning > 0 ? "fair" : "good";
  const verdict = latest.counts.critical > 0 ? "Mal" : latest.counts.warning > 0 ? "Regular" : "Bien";
  let change: Indicator["change"] = null;
  if (previous) {
    const diff = urgent - (previous.counts.critical + previous.counts.warning);
    change =
      diff < 0
        ? { direction: "better", text: `${Math.abs(diff)} menos que antes` }
        : diff > 0
          ? { direction: "worse", text: `${diff} más que antes` }
          : { direction: "same", text: "Igual que antes" };
  }
  return {
    label: "Problemas que corregir",
    value: String(urgent),
    tone,
    verdict,
    change,
  };
}

function ratingVerdict(rating: FieldRating): string {
  return rating === "good" ? "Bueno" : rating === "needs_improvement" ? "Mejorable" : "Malo";
}

function speedIndicator(latest: EvolutionPoint, previous: EvolutionPoint | null): Indicator {
  if (latest.score === null) {
    return { label: "Velocidad en móvil", value: "—", tone: "neutral", verdict: "No medida", change: null };
  }
  const rating = rateMetric("score", latest.score);
  let change: Indicator["change"] = null;
  if (previous?.score !== null && previous?.score !== undefined) {
    const diff = latest.score - previous.score;
    // Lighthouse scores move several points between identical runs: only ±10 counts as a change.
    change =
      diff >= SCORE_NOISE
        ? { direction: "better", text: `${signed(diff)} puntos` }
        : diff <= -SCORE_NOISE
          ? { direction: "worse", text: `${signed(diff)} puntos` }
          : { direction: "same", text: "Sin cambio apreciable" };
  }
  return {
    label: "Velocidad en móvil",
    value: `${latest.score}/100`,
    tone: RATING_TONE[rating],
    verdict: ratingVerdict(rating),
    change,
  };
}

function realUsersIndicator(audit: AuditLike | null): Indicator {
  const field = audit?.facts?.fieldData;
  if (field?.status !== "ok" || field.metrics?.lcpMs === null || field.metrics?.lcpMs === undefined) {
    return {
      label: "Experiencia de visitantes reales",
      value: "—",
      tone: "neutral",
      verdict: field?.status === "no_data" ? "Pocas visitas" : "Sin datos",
      change: null,
    };
  }
  const rating = rateMetric("lcp", field.metrics.lcpMs);
  const seconds = (field.metrics.lcpMs / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 });
  return {
    label: "Experiencia de visitantes reales",
    value: `${seconds} s`,
    tone: RATING_TONE[rating],
    verdict: ratingVerdict(rating),
    change: null,
  };
}

/** "Is it getting better?" — urgent problems first, then Google's speed score. */
export function trendBetween(latest: EvolutionPoint, previous: EvolutionPoint): Evolution["trend"] {
  const urgentDiff = latest.counts.critical + latest.counts.warning - (previous.counts.critical + previous.counts.warning);
  if (urgentDiff < 0) {
    return { direction: "better", tone: "good", text: `Va mejor: ${Math.abs(urgentDiff)} ${urgentDiff === -1 ? "problema menos" : "problemas menos"} que en la auditoría anterior.` };
  }
  if (urgentDiff > 0) {
    return { direction: "worse", tone: "bad", text: `Va peor: ${urgentDiff} ${urgentDiff === 1 ? "problema nuevo" : "problemas nuevos"} desde la auditoría anterior.` };
  }
  if (latest.score !== null && previous.score !== null) {
    const diff = latest.score - previous.score;
    if (diff >= SCORE_NOISE) return { direction: "better", tone: "good", text: `Va mejor: la web carga más rápido (${signed(diff)} puntos de velocidad).` };
    if (diff <= -SCORE_NOISE) return { direction: "worse", tone: "fair", text: `Va peor: la web carga más despacio (${signed(diff)} puntos de velocidad).` };
  }
  return { direction: "same", tone: "neutral", text: "Sin cambios relevantes desde la auditoría anterior." };
}

export function computeEvolution(audits: AuditLike[]): Evolution {
  const completed = audits
    .filter((a) => a.status === "completed")
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const points = completed.map(toPoint);
  const latest = points.at(-1) ?? null;
  const previous = points.length > 1 ? points.at(-2)! : null;
  if (!latest) return { points, latest, previous, headline: null, trend: null, indicators: [] };
  return {
    points,
    latest,
    previous,
    headline: auditHeadline(latest.counts),
    trend: previous ? trendBetween(latest, previous) : null,
    indicators: [problemsIndicator(latest, previous), speedIndicator(latest, previous), realUsersIndicator(completed.at(-1) ?? null)],
  };
}
