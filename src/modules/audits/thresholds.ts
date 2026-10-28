import { FIELD_THRESHOLDS, type FieldRating } from "@/modules/audits/crux";

/**
 * Metric thresholds and rating, with no user-facing text: importable from any module or
 * component without pulling in the message catalogs.
 *
 * Lab thresholds (Lighthouse mobile scoring) and field thresholds for the metrics that are
 * not Core Web Vitals (web.dev: FCP, TTFB). "Lower is better" except the Lighthouse score.
 */
export const METRIC_THRESHOLDS = {
  score: [90, 50],
  lcp: FIELD_THRESHOLDS.lcp,
  inp: FIELD_THRESHOLDS.inp,
  cls: FIELD_THRESHOLDS.cls,
  tbt: [200, 600],
  fcp: [1800, 3000],
  speedIndex: [3400, 5800],
  ttfb: [800, 1800],
} as const satisfies Record<string, readonly [number, number]>;

export type MetricName = keyof typeof METRIC_THRESHOLDS;

export function rateMetric(metric: MetricName, value: number): FieldRating {
  const [good, poor] = METRIC_THRESHOLDS[metric];
  if (metric === "score") {
    if (value >= good) return "good";
    return value >= poor ? "needs_improvement" : "poor";
  }
  if (value <= good) return "good";
  return value <= poor ? "needs_improvement" : "poor";
}
