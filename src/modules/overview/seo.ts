import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import type { EvolutionPoint } from "@/modules/audits/evolution";
import type { AuditFacts, Category, Severity } from "@/modules/audits/rules";
import { auditHeadline, isCategoryChecked, SEVERITY_TONE, type Tone } from "@/modules/audits/status";
import {
  auditAttempt,
  splitAudits,
  staleInfo,
  type Attempt,
  type AuditInput,
  type BlockState,
  type Change,
  type FindingLike,
  type Stale,
} from "@/modules/overview/types";

/**
 * Technical SEO health of the home page: the honest proxy while Search Console is not
 * connected. Performance findings are excluded everywhere (counts, headline, areas,
 * changes, chart): speed has its own block. No global score. Texts come from the catalog
 * of `locale`, Spanish by default (D007).
 */
export type SeoAreaKey = "indexability" | "metadata" | "structure" | "sitemap" | "canonicals" | "structured_data";

export interface SeoArea {
  key: SeoAreaKey;
  label: string;
  tone: Tone;
  verdict: string;
  count: number;
  firstFindingId: string | null;
}

export interface SeoSummary {
  state: BlockState;
  counts: Record<Severity, number>;
  tone: Tone;
  headline: { title: string; detail: string } | null;
  /** For the detail page; the overview card does not show them (AC-014). */
  areas: SeoArea[];
  change: Change | null;
  comparisonNote: string | null;
  auditedAt: Date | null;
  reason: string | null;
  attempt: Attempt | null;
  stale: Stale | null;
  auditId: string | null;
}

/** Findings by audit id. A missing entry means "not loaded", which blocks comparison. */
export type FindingsByAudit = Record<string, FindingLike[] | undefined>;

const SEO_CATEGORIES: Category[] = ["access", "indexability", "metadata", "headings", "crawling", "links", "structured_data", "social", "mobile"];
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

const AREA_KEYS: SeoAreaKey[] = ["indexability", "metadata", "structure", "sitemap", "canonicals", "structured_data"];

export function seoFindings<T extends FindingLike>(findings: T[]): T[] {
  return findings.filter((f) => f.category !== "performance");
}

export function seoCounts(findings: FindingLike[]): Record<Severity, number> {
  const seo = seoFindings(findings);
  const count = (s: Severity) => seo.filter((f) => f.severity === s).length;
  return { critical: count("critical"), warning: count("warning"), info: count("info") };
}

/** What an audit could check: SEO categories checked plus the rules version. Null when unknown. */
export function coverageKey(audit: AuditInput): string | null {
  if (!audit.facts || !audit.rulesVersion) return null;
  const checked = SEO_CATEGORIES.filter((c) => isCategoryChecked(c, audit.facts));
  return `${audit.rulesVersion}|${checked.join(",")}`;
}

function pageRead(facts: AuditFacts | null): boolean {
  return facts?.page.kind === "fetched" && facts.page.result.status < 400 && facts.page.result.facts !== null;
}

/** Canonical rules live in the indexability category but get their own tile. */
function areaOf(finding: FindingLike): SeoAreaKey | null {
  if (finding.ruleId.startsWith("canonical_")) return "canonicals";
  switch (finding.category) {
    case "access":
    case "indexability":
      return "indexability";
    case "metadata":
      return "metadata";
    case "headings":
    case "links":
    case "mobile":
      return "structure";
    case "crawling":
      return "sitemap";
    case "structured_data":
      return "structured_data";
    default:
      return null;
  }
}

function areaChecked(key: SeoAreaKey, facts: AuditFacts | null): boolean {
  switch (key) {
    case "indexability":
      return isCategoryChecked("indexability", facts);
    case "sitemap":
      return isCategoryChecked("crawling", facts);
    case "structure":
      return isCategoryChecked("headings", facts);
    // Canonical tags are read from the page content, like the metadata.
    case "metadata":
    case "canonicals":
      return isCategoryChecked("metadata", facts);
    case "structured_data":
      return isCategoryChecked("structured_data", facts);
  }
}

export function seoAreaStatuses(findings: FindingLike[], facts: AuditFacts | null, locale: Locale = DEFAULT_LOCALE): SeoArea[] {
  const m = getMessages(locale);
  const labels = m.overview.seo.areas;
  const verdict = m.audits.labels.verdict;
  const seo = seoFindings(findings);
  return AREA_KEYS.map((key) => {
    const related = seo.filter((f) => areaOf(f) === key);
    const base = { key, label: labels[key], count: related.length, firstFindingId: related[0]?.id ?? null };
    if (related.length === 0) {
      return areaChecked(key, facts) ? { ...base, tone: "good" as const, verdict: verdict.good } : { ...base, tone: "neutral" as const, verdict: verdict.unchecked };
    }
    const worst = related.reduce((a, b) => (SEVERITY_RANK[b.severity] < SEVERITY_RANK[a.severity] ? b : a)).severity;
    return { ...base, tone: SEVERITY_TONE[worst], verdict: verdict[worst] };
  });
}

export function urgentChange(latest: Record<Severity, number>, previous: Record<Severity, number>, locale: Locale = DEFAULT_LOCALE): Change {
  const t = getMessages(locale).overview.seo;
  const diff = latest.critical + latest.warning - (previous.critical + previous.warning);
  if (diff < 0) return { direction: "better", text: t.fewer(Math.abs(diff)) };
  if (diff > 0) return { direction: "worse", text: t.more(diff) };
  return { direction: "same", text: t.same };
}

export function summarizeSeo(audits: AuditInput[], findingsByAudit: FindingsByAudit, now: Date, locale: Locale = DEFAULT_LOCALE): SeoSummary {
  const t = getMessages(locale).overview.seo;
  const { result, previous, pending } = splitAudits(audits);
  const base: SeoSummary = {
    state: "no_data",
    counts: { critical: 0, warning: 0, info: 0 },
    tone: "neutral",
    headline: null,
    areas: [],
    change: null,
    comparisonNote: null,
    auditedAt: result?.startedAt ?? null,
    reason: null,
    attempt: result ? auditAttempt(pending, locale) : null,
    stale: staleInfo(result?.startedAt ?? null, now, locale),
    auditId: result?.id ?? null,
  };

  if (!result) {
    if (pending?.status === "running") return { ...base, state: "analyzing", reason: t.analyzingReason };
    if (pending?.status === "failed") return { ...base, state: "error", reason: t.errorReason };
    return { ...base, reason: t.firstAudit };
  }

  const loaded = findingsByAudit[result.id];
  // Without the findings we cannot tell problems from no problems: never default to "Bien".
  if (!loaded) return { ...base, state: "error", reason: t.notLoaded };
  const findings = loaded;
  const counts = seoCounts(findings);
  const read = pageRead(result.facts);
  let headline: { tone: Tone; title: string; detail: string };
  if (read) {
    headline = auditHeadline(counts, locale);
  } else {
    // A partial check is never presented as positive.
    const tone: Tone = counts.critical > 0 ? "bad" : counts.warning > 0 ? "fair" : "neutral";
    headline = { tone, title: tone === "neutral" ? t.partialTitle : auditHeadline(counts, locale).title, detail: t.partialDetail };
  }

  let change: Change | null = null;
  let comparisonNote: string | null = null;
  if (previous) {
    const previousFindings = findingsByAudit[previous.id];
    const a = coverageKey(result);
    const b = coverageKey(previous);
    if (previousFindings && a !== null && a === b) change = urgentChange(counts, seoCounts(previousFindings), locale);
    else comparisonNote = t.noComparison;
  }

  return {
    ...base,
    state: read ? "ok" : "partial",
    counts,
    tone: headline.tone,
    headline: { title: headline.title, detail: headline.detail },
    areas: seoAreaStatuses(findings, result.facts, locale),
    change,
    comparisonNote,
    reason: read ? null : t.partialDetail,
  };
}

/** Chart points with SEO findings only, oldest first. Audits whose findings were not loaded are skipped. */
export function seoHistoryPoints(audits: AuditInput[], findingsByAudit: FindingsByAudit): EvolutionPoint[] {
  return audits
    .filter((a) => a.status === "completed" && findingsByAudit[a.id] !== undefined)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((a) => ({ id: a.id, date: a.startedAt, counts: seoCounts(findingsByAudit[a.id]!), score: null, lcpMs: null, methodology: null }));
}
