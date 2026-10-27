import { sameMethodology, SCORE_NOISE, speedMethodology } from "@/modules/audits/evolution";
import { formatMs } from "@/modules/audits/presentation";
import type { PerformanceResult } from "@/modules/audits/pagespeed";
import { rateMetric, RATING_LABELS, RATING_TONE, type Tone } from "@/modules/audits/status";
import { auditAttempt, splitAudits, staleInfo, type Attempt, type AuditInput, type BlockState, type Change, type FindingLike, type Stale } from "@/modules/overview/types";

/**
 * Mobile speed as Google's PageSpeed Insights measured it (lab, simulated phone), kept apart
 * from real visitors (Chrome UX Report). Changes are reported only between the result and
 * the completed audit immediately before it, with the same strategy and Lighthouse major.
 */
export interface PerformanceSummary {
  state: BlockState;
  /** Lighthouse mobile performance score, only when really measured. */
  score: number | null;
  tone: Tone;
  verdict: string;
  change: Change | null;
  /** Why there is no change line although an earlier audit exists. */
  comparisonNote: string | null;
  measuredAt: Date | null;
  reason: string | null;
  /** Most important speed finding of the result audit. */
  topIssue: string | null;
  /** Real visitors (Chrome UX Report), with their own source, scope and period (D020). */
  field: { available: boolean; text: string; source: string | null };
  attempt: Attempt | null;
  stale: Stale | null;
  auditId: string | null;
}

const NOT_MEASURED: Record<Exclude<PerformanceResult["status"], "ok">, string> = {
  not_configured: "Falta la clave de PageSpeed Insights: la velocidad no se mide.",
  quota_exceeded: "La cuota diaria de PageSpeed Insights se agotó en esta auditoría.",
  error: "No se pudo medir la velocidad en esta auditoría.",
  skipped: "No se midió porque la portada no se pudo leer.",
};

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function measured(perf: PerformanceResult | undefined): perf is PerformanceResult & { score: number } {
  return perf?.status === "ok" && typeof perf.score === "number";
}

/** Change between two lab measurements, or why they cannot be compared. */
export function compareScores(
  latest: PerformanceResult,
  previous: PerformanceResult | undefined,
): { change: Change | null; note: string | null } {
  if (!measured(latest)) return { change: null, note: null };
  if (!measured(previous)) return { change: null, note: "Sin comparación: la auditoría anterior no midió la velocidad." };
  // Same definition as the chart segments (D019): strategy and known Lighthouse major.
  if (!sameMethodology(speedMethodology(latest), speedMethodology(previous))) {
    return { change: null, note: "Sin comparación: la medición anterior usó otra versión de la prueba de Google." };
  }
  const diff = latest.score - previous.score;
  if (diff >= SCORE_NOISE) return { change: { direction: "better", text: `${signed(diff)} puntos frente a la medición anterior` }, note: null };
  if (diff <= -SCORE_NOISE) return { change: { direction: "worse", text: `${signed(diff)} puntos frente a la medición anterior` }, note: null };
  return { change: { direction: "same", text: "Sin cambio apreciable frente a la medición anterior" }, note: null };
}

const periodDate = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "del 27 sept 2026 al 24 oct 2026" from the CrUX ISO dates; null when absent or unreadable. */
export function fieldPeriod(period: { firstDate: string; lastDate: string } | null | undefined): string | null {
  if (!period) return null;
  const from = new Date(`${period.firstDate}T00:00:00Z`);
  const to = new Date(`${period.lastDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return `del ${periodDate.format(from)} al ${periodDate.format(to)}`;
}

const SCOPE_TEXT = {
  url: "de esta página",
  // runCrux only falls back to the origin when the page itself has no record.
  origin: "de todo el sitio (la portada no tiene datos propios)",
} as const;

function fieldLine(audit: AuditInput | null): PerformanceSummary["field"] {
  const field = audit?.facts?.fieldData;
  const none = { available: false, text: "No hay datos de visitantes reales en esta medición.", source: null };
  if (!field) return none;
  if (field.status === "no_data") return { available: false, text: "Chrome UX Report no tiene datos suficientes de esta web.", source: null };
  const lcp = field.status === "ok" ? field.metrics?.lcpMs : null;
  if (typeof lcp !== "number") return none;
  const rating = RATING_LABELS[rateMetric("lcp", lcp)].toLowerCase();
  const scope = field.scope ? SCOPE_TEXT[field.scope] : "(alcance no indicado)";
  return {
    available: true,
    text: `Visitantes reales ${scope}: el contenido principal aparece en ${formatMs(lcp)} (${rating}).`,
    source: `Chrome UX Report · ${fieldPeriod(field.collectionPeriod) ?? "periodo no indicado"}`,
  };
}

/** `findings`: findings of the latest completed audit (any order is fine; they come sorted). */
export function summarizePerformance(audits: AuditInput[], findings: FindingLike[], now: Date): PerformanceSummary {
  const { result, previous, pending } = splitAudits(audits);
  const base: PerformanceSummary = {
    state: "no_data",
    score: null,
    tone: "neutral",
    verdict: "No medida",
    change: null,
    comparisonNote: null,
    measuredAt: result?.startedAt ?? null,
    reason: null,
    topIssue: null,
    field: fieldLine(result),
    attempt: result ? auditAttempt(pending) : null,
    stale: staleInfo(result?.startedAt ?? null, now),
    auditId: result?.id ?? null,
  };

  if (!result) {
    if (pending?.status === "running") return { ...base, state: "analyzing", verdict: "Analizando", reason: "Estamos midiendo la web. Tarda menos de un minuto." };
    if (pending?.status === "failed") return { ...base, state: "error", verdict: "Error", reason: "La auditoría no terminó. Vuelve a ejecutarla." };
    return { ...base, reason: "Ejecuta la primera auditoría para medir la velocidad de la web." };
  }

  const perf = result.facts?.performance;
  const topIssue = findings.find((f) => f.category === "performance")?.title ?? null;
  if (!perf || !measured(perf)) {
    const status = perf && perf.status !== "ok" ? perf.status : "error";
    return { ...base, state: status === "not_configured" ? "not_configured" : "partial", reason: NOT_MEASURED[status], topIssue };
  }

  const rating = rateMetric("score", perf.score);
  const { change, note } = compareScores(perf, previous?.facts?.performance);
  return {
    ...base,
    state: "ok",
    score: perf.score,
    tone: RATING_TONE[rating],
    verdict: RATING_LABELS[rating],
    change,
    comparisonNote: previous ? note : null,
    topIssue,
  };
}
