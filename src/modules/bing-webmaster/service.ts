import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { CollectOutcome } from "@/modules/bing-webmaster/collect";
import { bingWebmasterSnapshots, type BingWebmasterSnapshot } from "@/modules/bing-webmaster/schema";
import { getWorkspace } from "@/modules/workspaces/service";

export interface BingWebmasterDeps {
  /** Null when no usable key is configured: nothing is called and nothing is stored. */
  collect(site: { domain: string; hostname: string }): Promise<CollectOutcome> | null;
}

export type RefreshResult = { ok: true; snapshot: BingWebmasterSnapshot } | { ok: false; error: "not_found" | "not_configured" };

const FK_VIOLATION = "23503";

export async function refreshBingWebmaster(db: Database, workspaceId: string, deps: BingWebmasterDeps): Promise<RefreshResult> {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };
  const pending = deps.collect({ domain: workspace.domain, hostname: workspace.hostname });
  if (!pending) return { ok: false, error: "not_configured" };
  const outcome = await pending;

  const values: typeof bingWebmasterSnapshots.$inferInsert = outcome.ok
    ? {
        workspaceId: workspace.id,
        status: "completed",
        siteUrl: outcome.data.siteUrl,
        currentStart: outcome.data.current?.start,
        currentEnd: outcome.data.current?.end,
        previousStart: outcome.data.previous?.start,
        previousEnd: outcome.data.previous?.end,
        totals: outcome.data.totals,
        previousTotals: outcome.data.previousTotals,
        queries: outcome.data.queries,
        pages: outcome.data.pages,
        rowsStart: outcome.data.rows?.start,
        rowsEnd: outcome.data.rows?.end,
      }
    : {
        workspaceId: workspace.id,
        status: "failed",
        siteUrl: outcome.siteUrl,
        errorKind: outcome.kind,
        errorMessage: outcome.message,
        verifiedSites: outcome.verifiedSites,
      };

  try {
    const [snapshot] = await db.insert(bingWebmasterSnapshots).values(values).returning();
    return { ok: true, snapshot: snapshot! };
  } catch (error) {
    // The company was deleted while Bing answered: nothing to attach the result to.
    const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
    if (code === FK_VIOLATION) return { ok: false, error: "not_found" };
    throw error;
  }
}

export interface LatestBingWebmaster {
  /** Most recent attempt, whatever its outcome. */
  latest: BingWebmasterSnapshot | null;
  /** Most recent successful capture; stays visible after a later failure. */
  latestCompleted: BingWebmasterSnapshot | null;
}

export async function latestBingWebmaster(db: Database, workspaceId: string): Promise<LatestBingWebmaster> {
  const byNewest = desc(bingWebmasterSnapshots.createdAt);
  const [[latest], [latestCompleted]] = await Promise.all([
    db.select().from(bingWebmasterSnapshots).where(eq(bingWebmasterSnapshots.workspaceId, workspaceId)).orderBy(byNewest).limit(1),
    db
      .select()
      .from(bingWebmasterSnapshots)
      .where(and(eq(bingWebmasterSnapshots.workspaceId, workspaceId), eq(bingWebmasterSnapshots.status, "completed")))
      .orderBy(byNewest)
      .limit(1),
  ]);
  return { latest: latest ?? null, latestCompleted: latestCompleted ?? null };
}
