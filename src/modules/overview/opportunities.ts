import { findingText, type FindingContext } from "@/i18n/findings";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import type { AiSummary } from "@/modules/overview/ai";
import type { PerformanceSummary } from "@/modules/overview/performance";
import type { SeoSummary } from "@/modules/overview/seo";
import type { FindingLike } from "@/modules/overview/types";

/**
 * "Tus próximas oportunidades": up to three actions, each backed by a real finding or
 * measurement (FR-004). One per kind, highest priority first, stable order. Zero items is a
 * valid answer: the list is never filled with invented advice. `evidence` tells the view
 * which of the three empty/limited messages applies (AC-006).
 *
 * Texts come from the catalog of `locale` (Spanish by default). Finding titles and
 * recommendations are translated with `findingText` and the facts of the same audit
 * (`context`); when they cannot be, the stored Spanish text is kept and `original` says so.
 */
export type Priority = "high" | "medium" | "low";

export interface Opportunity {
  kind: string;
  priority: Priority;
  title: string;
  problem: string;
  why: string;
  action: string;
  evidence: string[];
  sourceLabel: string;
  measuredAt: Date;
  /** Path relative to the workspace, e.g. "/seo#finding-…". */
  href: string;
  /** True when `problem`/`action` are the stored Spanish texts shown because they could not be translated. */
  original: boolean;
  /**
   * Index of the first evidence line that is stored text (Spanish, as recorded). Earlier lines
   * are written here in the interface language; `evidence.length` means none is stored.
   */
  storedEvidenceFrom: number;
}

export interface OpportunityList {
  items: Opportunity[];
  /** none: nothing usable yet · partial: some block unmeasured or partial · complete: all three measured. */
  evidence: "none" | "partial" | "complete";
  /** Plain-words list of what is missing, for the "partial" message. */
  pending: string[];
}

export const MAX_OPPORTUNITIES = 3;
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

type OpportunityTexts = Messages["overview"]["opportunity"];
type Candidate = Omit<Opportunity, "sourceLabel" | "measuredAt" | "href" | "problem" | "action" | "evidence" | "original" | "storedEvidenceFrom">;

function candidateFor(f: FindingLike, title: string, t: OpportunityTexts): Candidate | null {
  if (f.category === "performance") return null;
  if (f.ruleId.startsWith("canonical_")) {
    return f.severity === "info" ? null : { kind: "canonicals", priority: "medium", title: t.canonicals.title, why: t.canonicals.why };
  }
  if (f.ruleId === "structured_data_missing") {
    return { kind: "structured_data", priority: "low", title: t.structuredData.title, why: t.structuredData.why };
  }
  const priority: Priority | null = f.severity === "critical" ? "high" : f.severity === "warning" ? "medium" : null;
  if (!priority) return null;
  switch (f.category) {
    case "access":
      return priority === "high" ? { kind: "access", priority, title: t.access.title, why: t.access.why } : null;
    case "indexability":
      return { kind: "indexability", priority, title: t.indexability.title, why: t.indexability.why };
    case "metadata":
      return { kind: "metadata", priority, title: t.metadata.title, why: t.metadata.why };
    case "crawling":
      return f.ruleId.startsWith("sitemap_") ? { kind: "sitemap", priority, title: t.sitemap.title, why: t.sitemap.why } : null;
    default:
      // Critical findings of any other area are still top priority.
      return priority === "high" ? { kind: `critical_${f.category}`, priority, title, why: t.criticalWhy } : null;
  }
}

function speedOpportunity(perf: PerformanceSummary, findings: FindingLike[], context: FindingContext | undefined, locale: Locale, t: OpportunityTexts): Opportunity | null {
  if (perf.score === null || perf.score >= 90 || !perf.measuredAt) return null;
  const top = findings.find((f) => f.category === "performance");
  const text = top ? findingText(top, locale, context) : null;
  return {
    kind: "speed",
    priority: perf.score < 50 ? "high" : "medium",
    title: t.speed.title,
    problem: text?.title ?? t.speed.problem(perf.score),
    why: t.speed.why,
    action: text?.recommendation ?? t.speed.action,
    evidence: [t.speed.evidence(perf.score, perf.verdict.toLowerCase()), ...(top?.evidence.slice(0, 2) ?? [])],
    sourceLabel: t.speed.source,
    measuredAt: perf.measuredAt,
    href: "/performance",
    original: text?.fallback ?? false,
    // The score line is written in the interface language; the finding's lines are stored.
    storedEvidenceFrom: 1,
  };
}

function aiOpportunity(ai: AiSummary, t: OpportunityTexts): Opportunity | null {
  if (!ai.coverage || ai.coverage.n === 0 || ai.uncovered.length === 0 || !ai.measuredAt) return null;
  return {
    kind: "ai_coverage",
    priority: "medium",
    title: t.ai.title,
    problem: t.ai.problem(ai.uncovered.length, ai.coverage.n),
    why: t.ai.why,
    action: t.ai.action,
    evidence: ai.uncovered.slice(0, 3).map((q) => t.ai.evidence(q)),
    sourceLabel: t.ai.source(ai.provider ?? t.ai.unknownProvider),
    measuredAt: ai.measuredAt,
    href: "/geo#aeo",
    original: false,
    // Written here: the frame is in the interface language and quotes the market question.
    storedEvidenceFrom: MAX_OPPORTUNITIES,
  };
}

function pendingOf(seo: SeoSummary, perf: PerformanceSummary, ai: AiSummary, t: OpportunityTexts): string[] {
  const pending: string[] = [];
  if (seo.state === "partial") pending.push(t.pending.seoPartial);
  else if (seo.state !== "ok") pending.push(t.pending.seoNone);
  if (perf.score === null) pending.push(t.pending.speed);
  if (ai.state === "not_configured") pending.push(t.pending.aiNotConfigured);
  else if (!ai.coverage) pending.push(t.pending.aiNone);
  else if (ai.state !== "ok") pending.push(t.pending.aiIncomplete);
  return pending;
}

/** `context`: facts and rules version of the audit the `findings` belong to (never another audit's). */
export function buildOpportunities(
  input: { findings: FindingLike[]; seo: SeoSummary; performance: PerformanceSummary; ai: AiSummary; context?: FindingContext },
  locale: Locale = DEFAULT_LOCALE,
): OpportunityList {
  const { findings, seo, performance, ai, context } = input;
  const t = getMessages(locale).overview.opportunity;
  const candidates: Opportunity[] = [];
  if (seo.auditedAt) {
    for (const f of findings) {
      const text = findingText(f, locale, context);
      const c = candidateFor(f, text.title, t);
      if (c) {
        candidates.push({
          ...c,
          problem: text.title,
          action: text.recommendation,
          evidence: f.evidence.slice(0, 3),
          sourceLabel: t.auditSource,
          measuredAt: seo.auditedAt,
          href: `/seo#finding-${f.id}`,
          original: text.fallback,
          storedEvidenceFrom: 0,
        });
      }
    }
  }
  const speed = speedOpportunity(performance, findings, context, locale, t);
  if (speed) candidates.push(speed);
  const aiItem = aiOpportunity(ai, t);
  if (aiItem) candidates.push(aiItem);

  const seen = new Set<string>();
  const items = candidates
    .filter((c) => (seen.has(c.kind) ? false : (seen.add(c.kind), true)))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, MAX_OPPORTUNITIES);

  const anyResult = seo.auditedAt !== null || performance.score !== null || ai.coverage !== null;
  const pending = pendingOf(seo, performance, ai, t);
  return { items, evidence: !anyResult ? "none" : pending.length > 0 ? "partial" : "complete", pending };
}

/**
 * What the single original-language notice of the English overview must say (AC-009): whether
 * stored evidence is shown, and whether any finding text appears in its stored Spanish because
 * it could not be translated, be it in an opportunity or in the performance card's main problem.
 */
export function overviewOriginalText(list: OpportunityList, performance: Pick<PerformanceSummary, "topIssue" | "topIssueOriginal">): {
  storedEvidence: boolean;
  fallback: boolean;
} {
  return {
    storedEvidence: list.items.some((o) => o.storedEvidenceFrom < o.evidence.length),
    fallback: list.items.some((o) => o.original) || (performance.topIssue !== null && performance.topIssueOriginal),
  };
}
