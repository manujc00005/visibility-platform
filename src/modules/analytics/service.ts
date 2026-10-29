import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { CollectOutcome } from "@/modules/analytics/collect";
import { analyticsSnapshots, type AnalyticsSnapshot } from "@/modules/analytics/schema";
import { getWorkspace } from "@/modules/workspaces/service";

export interface AnalyticsDeps {
  /** Null when no usable credential is configured: nothing is called and nothing is stored. */
  collect(site: { domain: string; hostname: string }): Promise<CollectOutcome> | null;
}

export type RefreshResult = { ok: true; snapshot: AnalyticsSnapshot } | { ok: false; error: "not_found" | "not_configured" };

const FK_VIOLATION = "23503";

export async function refreshAnalytics(db: Database, workspaceId: string, deps: AnalyticsDeps): Promise<RefreshResult> {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };
  const pending = deps.collect({ domain: workspace.domain, hostname: workspace.hostname });
  if (!pending) return { ok: false, error: "not_configured" };
  const outcome = await pending;

  const values: typeof analyticsSnapshots.$inferInsert = outcome.ok
    ? {
        workspaceId: workspace.id,
        status: "completed",
        property: outcome.data.property,
        propertyName: outcome.data.propertyName,
        currentStart: outcome.data.current.start,
        currentEnd: outcome.data.current.end,
        previousStart: outcome.data.previous.start,
        previousEnd: outcome.data.previous.end,
        totals: outcome.data.totals,
        previousTotals: outcome.data.previousTotals,
        channels: outcome.data.channels,
        pages: outcome.data.pages,
        quality: outcome.data.quality,
      }
    : {
        workspaceId: workspace.id,
        status: "failed",
        property: outcome.property,
        errorKind: outcome.kind,
        errorMessage: outcome.message,
        accessibleProperties: outcome.accessibleProperties,
        propertiesSkipped: outcome.propertiesSkipped,
      };

  try {
    const [snapshot] = await db.insert(analyticsSnapshots).values(values).returning();
    return { ok: true, snapshot: snapshot! };
  } catch (error) {
    // The company was deleted while Google answered: nothing to attach the result to.
    const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
    if (code === FK_VIOLATION) return { ok: false, error: "not_found" };
    throw error;
  }
}

export interface LatestAnalytics {
  /** Most recent attempt, whatever its outcome. */
  latest: AnalyticsSnapshot | null;
  /** Most recent successful capture; stays visible after a later failure. */
  latestCompleted: AnalyticsSnapshot | null;
}

export async function latestAnalytics(db: Database, workspaceId: string): Promise<LatestAnalytics> {
  const byNewest = desc(analyticsSnapshots.createdAt);
  const [[latest], [latestCompleted]] = await Promise.all([
    db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.workspaceId, workspaceId)).orderBy(byNewest).limit(1),
    db
      .select()
      .from(analyticsSnapshots)
      .where(and(eq(analyticsSnapshots.workspaceId, workspaceId), eq(analyticsSnapshots.status, "completed")))
      .orderBy(byNewest)
      .limit(1),
  ]);
  return { latest: latest ?? null, latestCompleted: latestCompleted ?? null };
}
