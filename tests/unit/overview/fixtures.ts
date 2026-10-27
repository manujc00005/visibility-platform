import { emptyFieldData, type FieldDataResult } from "@/modules/audits/crux";
import { extractPage } from "@/modules/audits/html";
import { emptyResult, type PerformanceResult } from "@/modules/audits/pagespeed";
import type { AuditFacts } from "@/modules/audits/rules";
import { computeGeoMetrics, type MetricsObservation } from "@/modules/geo/metrics";
import type { PromptIntent } from "@/modules/geo/prompt-suggestions";
import type { RunLike } from "@/modules/overview/ai";
import type { AuditInput, FindingLike } from "@/modules/overview/types";

export const NOW = new Date("2026-10-26T12:00:00Z");
export const DAY = 86_400_000;
export const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);

export function perf(score: number, lighthouseVersion: string | null = "12.8.2"): PerformanceResult {
  return {
    status: "ok",
    strategy: "mobile",
    score,
    metrics: { lcpMs: 2000, cls: 0, tbtMs: 50, fcpMs: 900, speedIndexMs: 1500 },
    lighthouseVersion,
    error: null,
  };
}

export { emptyResult, emptyFieldData };

const URL_ = "https://e.es/";

export function facts(options: { readable?: boolean; performance?: PerformanceResult; fieldData?: FieldDataResult } = {}): AuditFacts {
  const { readable = true, performance = emptyResult("not_configured"), fieldData } = options;
  return {
    requestedUrl: URL_,
    httpsFailure: null,
    page: readable
      ? { kind: "fetched", result: { url: URL_, status: 200, contentType: "text/html", xRobotsTag: null, redirects: [], facts: extractPage("<html><head><title>x</title></head></html>", URL_) } }
      : { kind: "failed", failure: { kind: "timeout", url: URL_, message: "timeout" } as never },
    robots: null,
    sitemap: null,
    performance,
    fieldData,
  };
}

let n = 0;
export function audit(partial: Partial<AuditInput> & { at: Date }): AuditInput {
  n += 1;
  const { at, ...rest } = partial;
  return {
    id: `a${n}`,
    status: "completed",
    startedAt: at,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    facts: facts(),
    rulesVersion: "r1",
    ...rest,
  };
}

let f = 0;
export function finding(partial: Partial<FindingLike> & Pick<FindingLike, "severity" | "category">): FindingLike {
  f += 1;
  return { id: `f${f}`, ruleId: `rule_${f}`, title: `Hallazgo ${f}`, evidence: [`evidencia ${f}`], recommendation: `Haz ${f}`, ...partial };
}

/** A run from questions and per-question outcomes: "yes" = answered with brand, "no" = answered without brand, "none" = no valid answer, "failed" = capture failed. */
export function run(
  options: {
    at: Date;
    key?: string;
    status?: RunLike["status"];
    questions: { id: string; intent?: PromptIntent; outcomes: ("yes" | "no" | "none" | "failed")[] }[];
    cited?: number;
  },
): RunLike {
  n += 1;
  const prompts = options.questions.map((q) => ({ id: q.id, text: `Pregunta ${q.id}`, intent: q.intent ?? ("discovery" as const) }));
  let cited = options.cited ?? 0;
  const observations: MetricsObservation[] = options.questions.flatMap((q) =>
    q.outcomes.map((o, i) => {
      const answered = o === "yes" || o === "no";
      const ownCited = answered && cited > 0 ? (cited--, true) : false;
      return {
        promptId: q.id,
        repetition: i + 1,
        status: o === "failed" ? ("failed" as const) : ("completed" as const),
        answerPresent: o === "failed" ? null : answered,
        mentions: answered ? { brand: o === "yes", competitors: {} } : null,
        ownCited: answered ? ownCited : null,
        competitorsCited: answered ? [] : null,
      };
    }),
  );
  return {
    id: `r${n}`,
    status: options.status ?? "completed",
    provider: "manual",
    methodologyKey: options.key ?? "k1",
    createdAt: options.at,
    completedAt: options.status === "collecting" ? null : options.at,
    metrics: computeGeoMetrics({ prompts, competitors: [] }, observations),
  };
}
