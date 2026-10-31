import { STALE_RUNNING_AFTER_MS, type LatestComparison } from "@/modules/competitor-comparison/service";
import { parseComparison, selectSites, type SiteResult } from "@/modules/competitor-comparison/sites";

export type ComparisonBlocker = "not_configured" | "no_competitors" | null;

export type ComparisonRow = {
  key: string;
  role: "company" | "competitor";
  /** Current name; the figures may belong to a site then called otherwise. */
  name: string;
  domain: string;
} & ({ state: "measured"; site: SiteResult; measuredAs: string | null } | { state: "pending" });

export interface ComparisonSummary {
  blocker: ComparisonBlocker;
  running: boolean;
  /** An attempt newer than the figures shown, which it did not replace. */
  failure: { error: "internal_error" | "interrupted"; at: Date } | null;
  /** The newest completed comparison cannot be read; an older one is never shown instead. */
  unreadable: boolean;
  capture: { startedAt: Date; finishedAt: Date | null } | null;
  rows: ComparisonRow[];
  /** Real-user data of some rows is from the page and of others from the whole site (FR-013). */
  mixedFieldScope: boolean;
  withoutWebsite: string[];
}

interface CompanyInput {
  name: string;
  domain: string;
  hostname: string;
}

interface CompetitorInput {
  id: string;
  name: string;
  domain: string | null;
  createdAt: Date;
}

interface Input {
  stored: LatestComparison;
  company: CompanyInput;
  competitors: readonly CompetitorInput[];
  config: { pageSpeed: boolean };
  now: Date;
}

/**
 * Figures of one comparison crossed with the sites of today. A figure stays only while the site is
 * the same one: same competitor, domain and hostname. A new name is not a new site.
 */
export function summarizeComparison({ stored, company, competitors, config, now }: Input): ComparisonSummary {
  const { latest, latestCompleted } = stored;
  const selection = selectSites(company, competitors);
  const comparison = latestCompleted ? parseComparison(latestCompleted.sites) : null;
  const captured = comparison?.sites ?? [];

  const rows = selection.sites.map((current): ComparisonRow => {
    const base = { key: current.competitorId ?? "company", role: current.role, name: current.name, domain: current.domain };
    const site = captured.find((s) => s.role === current.role && s.competitorId === current.competitorId && s.domain === current.domain && s.hostname === current.hostname);
    if (!site) return { ...base, state: "pending" };
    return { ...base, state: "measured", site, measuredAs: site.name === current.name ? null : site.name };
  });

  const scopes = new Set(rows.flatMap((row) => (row.state === "measured" && row.site.field.status === "ok" ? [row.site.field.scope] : [])));
  const fresh = latest?.status === "running" && now.getTime() - latest.startedAt.getTime() < STALE_RUNNING_AFTER_MS;
  const failed = latest?.status === "failed" && latest.error ? { error: latest.error, at: latest.finishedAt ?? latest.startedAt } : null;

  return {
    blocker: !config.pageSpeed ? "not_configured" : selection.eligible ? null : "no_competitors",
    running: fresh,
    failure: failed,
    unreadable: Boolean(latestCompleted) && !comparison,
    capture: latestCompleted ? { startedAt: latestCompleted.startedAt, finishedAt: latestCompleted.finishedAt } : null,
    rows,
    mixedFieldScope: scopes.size > 1,
    withoutWebsite: selection.withoutWebsite.map((c) => c.name),
  };
}
