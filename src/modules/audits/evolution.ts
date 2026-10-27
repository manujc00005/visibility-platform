import type { PerformanceResult } from "@/modules/audits/pagespeed";
import type { AuditFacts, Severity } from "@/modules/audits/rules";
import type { Tone } from "@/modules/audits/status";

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
 * Indices of the points a speed line may join: runs of consecutive points that all have a
 * score and the same known methodology. A different or unknown version, or an audit
 * without measurement in between, starts a new segment (D019). Unmeasured points belong
 * to no segment.
 */
export function speedSegments(points: SpeedPoint[]): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  points.forEach((p, i) => {
    if (p.score === null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
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
export function speedBreaks(points: SpeedPoint[]): { differentVersion: boolean; unknownVersion: boolean; gap: boolean } {
  const measured = points.map((p, i) => ({ p, i })).filter(({ p }) => p.score !== null);
  let differentVersion = false;
  let gap = false;
  for (let k = 1; k < measured.length; k++) {
    const a = measured[k - 1]!;
    const b = measured[k]!;
    if (b.i - a.i > 1) gap = true;
    if (a.p.methodology && b.p.methodology && !sameMethodology(a.p.methodology, b.p.methodology)) differentVersion = true;
  }
  return { differentVersion, unknownVersion: measured.some(({ p }) => p.methodology === null), gap };
}

/** Lighthouse mobile scores vary this much between identical runs; smaller moves are noise. */
export const SCORE_NOISE = 10;

export const DIRECTION_TONE: Record<Direction, Tone> = { better: "good", same: "neutral", worse: "bad" };
