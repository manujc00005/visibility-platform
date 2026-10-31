import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { logger } from "@/lib/logger";
import { collectAuditFacts, type CollectDeps } from "@/modules/audits/collect";
import { evaluateAudit, RULES_VERSION, type AuditFacts } from "@/modules/audits/rules";
import { competitorComparisons, type CompetitorComparison } from "@/modules/competitor-comparison/schema";
import { parseComparison, selectSites, toSiteResult, type AuthorityResult, type SiteResult, type SiteTarget } from "@/modules/competitor-comparison/sites";
import { listCompetitors } from "@/modules/geo/service";
import { getWorkspace } from "@/modules/workspaces/service";

export const STALE_RUNNING_AFTER_MS = 10 * 60_000;
/** Sites measured at once: enough to finish within minutes, few enough to go easy on PageSpeed (D006). */
export const MAX_PARALLEL_SITES = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONE_RUNNING = "competitor_comparisons_one_running_per_workspace";
const FK_VIOLATION = "23503";

export interface ComparisonDeps {
  audit: CollectDeps;
  authority: (domains: readonly string[]) => Promise<Map<string, AuthorityResult>>;
  pageSpeedConfigured: boolean;
}

export type ComparisonError = "not_found" | "not_configured" | "no_competitors" | "already_running" | "capture_closed";
export type RunComparisonResult = { ok: true; comparison: CompetitorComparison } | { ok: false; error: ComparisonError };

function pgCode(error: unknown): { code?: string; constraint?: string } {
  return (error instanceof Error && error.cause ? error.cause : error) as { code?: string; constraint?: string };
}

async function closeStaleRuns(db: Database, workspaceId: string): Promise<void> {
  const closed = await db
    .update(competitorComparisons)
    .set({ status: "failed", error: "interrupted", finishedAt: sql`now()` })
    .where(
      and(
        eq(competitorComparisons.workspaceId, workspaceId),
        eq(competitorComparisons.status, "running"),
        lt(competitorComparisons.startedAt, sql`now() - ${`${STALE_RUNNING_AFTER_MS / 1000} seconds`}::interval`),
      ),
    )
    .returning({ id: competitorComparisons.id });
  if (closed.length) logger.warn({ workspaceId, comparisonIds: closed.map((c) => c.id) }, "stale comparisons closed as interrupted");
}

async function measure(targets: readonly SiteTarget[], deps: ComparisonDeps): Promise<SiteResult[]> {
  const authority = deps.authority(targets.map((target) => target.domain));
  const audited: AuditFacts[] = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const index = next++;
      const { facts } = await collectAuditFacts(targets[index]!.hostname, deps.audit, { robotsBeforeEachRequest: true });
      audited[index] = facts;
    }
  };
  const [byDomain] = await Promise.all([authority, ...Array.from({ length: Math.min(MAX_PARALLEL_SITES, targets.length) }, worker)]);
  return targets.map((target, index) => {
    const facts = audited[index]!;
    return toSiteResult(target, facts, evaluateAudit(facts), byDomain.get(target.domain) ?? { status: "error", requestedDomain: target.domain });
  });
}

/** Writes the outcome only if this very attempt is still open: a late worker changes nothing. */
async function close(
  db: Database,
  workspaceId: string,
  id: string,
  values: Pick<CompetitorComparison, "status"> & Partial<Pick<CompetitorComparison, "sites" | "error">>,
): Promise<RunComparisonResult> {
  const [row] = await db
    .update(competitorComparisons)
    .set({ ...values, finishedAt: sql`now()` })
    .where(and(eq(competitorComparisons.id, id), eq(competitorComparisons.workspaceId, workspaceId), eq(competitorComparisons.status, "running")))
    .returning();
  if (row) return { ok: true, comparison: row };
  return { ok: false, error: (await getWorkspace(db, workspaceId)) ? "capture_closed" : "not_found" };
}

/**
 * Measures the company and its competitors in one attempt, without holding anything on the
 * database during the network. A website or a provider that fails leaves its state in the row.
 */
export async function runComparison(db: Database, workspaceId: string, deps: ComparisonDeps): Promise<RunComparisonResult> {
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) return { ok: false, error: "not_found" };
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };

  await closeStaleRuns(db, workspaceId);

  // Read once: the attempt works with these sites, whatever changes during the network calls.
  const selection = selectSites(workspace, await listCompetitors(db, workspaceId));
  if (!deps.pageSpeedConfigured) return { ok: false, error: "not_configured" };
  if (!selection.eligible) return { ok: false, error: "no_competitors" };

  let id: string;
  try {
    const [row] = await db.insert(competitorComparisons).values({ workspaceId, rulesVersion: RULES_VERSION }).returning({ id: competitorComparisons.id });
    id = row!.id;
  } catch (error) {
    const { code, constraint } = pgCode(error);
    if (code === "23505" && constraint === ONE_RUNNING) return { ok: false, error: "already_running" };
    if (code === FK_VIOLATION) return { ok: false, error: "not_found" };
    throw error;
  }

  const started = Date.now();
  try {
    const sites = await measure(selection.sites, deps);
    const comparison = parseComparison({ version: 1, sites });
    if (!comparison) throw new Error("Comparison out of contract");
    const result = await close(db, workspaceId, id, { status: "completed", sites: comparison });
    logger.info(
      { workspaceId, comparisonId: id, ms: Date.now() - started, sites: sites.map((s) => [s.access, s.lighthouse.status, s.field.status, s.authority.status].join("/")) },
      "comparison finished",
    );
    return result;
  } catch (error) {
    logger.error({ err: error, workspaceId, comparisonId: id }, "comparison failed");
    return close(db, workspaceId, id, { status: "failed", error: "internal_error" });
  }
}

export interface LatestComparison {
  /** Most recent attempt, whatever its outcome. */
  latest: CompetitorComparison | null;
  /** Most recent completed one; stays visible after a later failure. */
  latestCompleted: CompetitorComparison | null;
}

export async function latestComparison(db: Database, workspaceId: string): Promise<LatestComparison> {
  const newest = [desc(competitorComparisons.startedAt), desc(competitorComparisons.id)];
  const [[latest], [latestCompleted]] = await Promise.all([
    db.select().from(competitorComparisons).where(eq(competitorComparisons.workspaceId, workspaceId)).orderBy(...newest).limit(1),
    db
      .select()
      .from(competitorComparisons)
      .where(and(eq(competitorComparisons.workspaceId, workspaceId), eq(competitorComparisons.status, "completed")))
      .orderBy(...newest)
      .limit(1),
  ]);
  return { latest: latest ?? null, latestCompleted: latestCompleted ?? null };
}
