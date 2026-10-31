import type { PerformanceResult } from "@/modules/audits/pagespeed";
import type { AuditFacts, Severity } from "@/modules/audits/rules";
import type { Tone } from "@/modules/audits/status";
import { METRIC_THRESHOLDS } from "@/modules/audits/thresholds";

/**
 * Shared vocabulary for audit history: the audit shape the summaries read, one chart point
 * per completed audit, and the noise threshold of Google's speed score. Pure, no I/O.
 * Deliberately no composite "SEO score" (B06): history is told with counts of problems by
 * severity and with Google's own speed score, which are real measurements. The owner-facing
 * summaries built on top of this live in `src/modules/overview/`.
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
  /** How the score was measured; null when not measured or the Lighthouse version is unknown. */
  methodology: SpeedMethodology | null;
}

/** Two lab scores are comparable only with the same strategy and Lighthouse major (D019). */
export interface SpeedMethodology {
  strategy: string;
  major: string;
}

export function speedMethodology(perf: PerformanceResult | undefined): SpeedMethodology | null {
  if (perf?.status !== "ok" || typeof perf.score !== "number") return null;
  const major = perf.lighthouseVersion?.trim().split(".")[0];
  return major && /^\d+$/.test(major) ? { strategy: perf.strategy, major } : null;
}

export function sameMethodology(a: SpeedMethodology | null, b: SpeedMethodology | null): boolean {
  return a !== null && b !== null && a.strategy === b.strategy && a.major === b.major;
}

export type Direction = "better" | "same" | "worse";

export function toPoint(audit: AuditLike): EvolutionPoint {
  const perf = audit.facts?.performance;
  const ok = perf?.status === "ok";
  return {
    id: audit.id,
    date: audit.startedAt,
    counts: { critical: audit.criticalCount, warning: audit.warningCount, info: audit.infoCount },
    score: ok ? perf.score : null,
    lcpMs: ok ? (perf.metrics?.lcpMs ?? null) : null,
    methodology: speedMethodology(perf),
  };
}

type SpeedPoint = Pick<EvolutionPoint, "score" | "methodology">;

/**
 * Indices of the points a speed line may join: runs of measured points with the same known
 * methodology. A different or unknown version starts a new segment; an audit that measured
 * nothing says nothing about speed, so it belongs to no segment and does not cut one (D025).
 */
export function speedSegments(points: SpeedPoint[]): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  points.forEach((p, i) => {
    if (p.score === null) return;
    const previous = current.length ? points[current.at(-1)!]! : null;
    if (previous && !sameMethodology(previous.methodology, p.methodology)) {
      segments.push(current);
      current = [];
    }
    current.push(i);
  });
  if (current.length) segments.push(current);
  return segments;
}

/** Why the line is broken among the points shown, to explain it under the chart. */
export function speedBreaks(points: SpeedPoint[]): { differentVersion: boolean; unknownVersion: boolean } {
  const measured = points.filter((p) => p.score !== null);
  const differentVersion = measured.some((p, k) => {
    const previous = measured[k - 1];
    return Boolean(previous?.methodology && p.methodology && !sameMethodology(previous.methodology, p.methodology));
  });
  return { differentVersion, unknownVersion: measured.some((p) => p.methodology === null) };
}

/** Lighthouse mobile scores vary this much between identical runs; smaller moves are noise. */
export const SCORE_NOISE = 10;

/**
 * Score axis of the speed chart. It ends at 100 and starts a noise margin below the lowest
 * score, in tens, so a good site does not sit in a sliver above an empty 0–80. The "good"
 * threshold stays in view with room below it, and a low score falls back towards 0.
 */
export function speedAxis(scores: number[]): { min: number; ticks: number[] } {
  const [good, poor] = METRIC_THRESHOLDS.score;
  const lowest = Math.min(...scores, 100);
  const min = Math.max(0, Math.min(good - 10, Math.floor((lowest - SCORE_NOISE) / 10) * 10));
  if (100 - min <= poor) return { min, ticks: Array.from({ length: (100 - min) / 10 + 1 }, (_, i) => min + i * 10) };
  return { min, ticks: [...new Set([min, poor, good, 100])].filter((tick) => tick >= min) };
}

export const DIRECTION_TONE: Record<Direction, Tone> = { better: "good", same: "neutral", worse: "bad" };
