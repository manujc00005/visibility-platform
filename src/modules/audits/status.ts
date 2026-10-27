import { FIELD_THRESHOLDS, type FieldRating } from "@/modules/audits/crux";
import { CATEGORY_LABELS } from "@/modules/audits/presentation";
import type { AuditFacts, Category, Severity } from "@/modules/audits/rules";

/**
 * Traffic-light view of an audit for the operator's screen. Pure functions: they only
 * classify stored facts and findings, they never invent a global score (B06).
 *
 * Two different questions get two different colourings:
 * - priority of a finding: critical = red, important = amber, optional improvement = blue;
 * - quality of a measured metric: good = green, needs improvement = amber, poor = red.
 */
export type Tone = "good" | "fair" | "bad" | "info" | "neutral";

export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "bad", warning: "fair", info: "info" };

export const RATING_TONE: Record<FieldRating, Tone> = { good: "good", needs_improvement: "fair", poor: "bad" };
export const RATING_LABELS: Record<FieldRating, string> = { good: "Bueno", needs_improvement: "Mejorable", poor: "Malo" };

/**
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

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Categories whose checks need the home page content. */
const CONTENT_CATEGORIES: Category[] = ["metadata", "headings", "links", "structured_data", "social", "mobile"];

export interface CategoryStatus {
  category: Category;
  label: string;
  tone: Tone;
  verdict: string;
  count: number;
  /** First finding of the category, to link the tile to it. */
  firstFindingId: string | null;
}

interface FindingLike {
  id: string;
  severity: Severity;
  category: string;
}

export function isCategoryChecked(category: Category, facts: AuditFacts | null): boolean {
  if (!facts) return false;
  const readable = facts.page.kind === "fetched" && facts.page.result.status < 400 && facts.page.result.facts !== null;
  if (CONTENT_CATEGORIES.includes(category)) return readable;
  if (category === "performance") return facts.performance.status === "ok" || facts.fieldData?.status === "ok";
  return true;
}

/** One tile per area: red if any critical, amber if any important, blue if only optional, green if clean. */
export function categoryStatuses(findings: FindingLike[], facts: AuditFacts | null): CategoryStatus[] {
  return (Object.keys(CATEGORY_LABELS) as Category[]).map((category) => {
    const related = findings.filter((f) => f.category === category);
    const base = { category, label: CATEGORY_LABELS[category], count: related.length, firstFindingId: related[0]?.id ?? null };
    if (related.length === 0) {
      return isCategoryChecked(category, facts)
        ? { ...base, tone: "good" as const, verdict: "Bien" }
        : { ...base, tone: "neutral" as const, verdict: "No comprobado" };
    }
    const worst = related.reduce((a, b) => (SEVERITY_RANK[b.severity] < SEVERITY_RANK[a.severity] ? b : a)).severity;
    const verdict = worst === "critical" ? "Mal" : worst === "warning" ? "Regular" : "Mejorable";
    return { ...base, tone: SEVERITY_TONE[worst], verdict };
  });
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Headline for the whole audit, driven by the most severe finding (not a score). */
export function auditHeadline(counts: Record<Severity, number>): { tone: Tone; title: string; detail: string } {
  if (counts.critical > 0) {
    return {
      tone: "bad",
      title: plural(counts.critical, "problema crítico", "problemas críticos"),
      detail: "Resuélvelos primero: impiden o dificultan que Google muestre la web.",
    };
  }
  if (counts.warning > 0) {
    return {
      tone: "fair",
      title: `Sin problemas críticos · ${plural(counts.warning, "aspecto importante", "aspectos importantes")}`,
      detail: "La web funciona, pero hay puntos que conviene corregir pronto.",
    };
  }
  return {
    tone: "good",
    title: counts.info > 0 ? "Bien: sin problemas críticos ni importantes" : "Bien: no hemos detectado problemas",
    detail:
      counts.info > 0
        ? `${counts.info === 1 ? "Queda" : "Quedan"} ${plural(counts.info, "mejora opcional", "mejoras opcionales")}.`
        : "Repite el análisis tras cualquier cambio importante en la web.",
  };
}
