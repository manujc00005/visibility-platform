import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { CollectOutcome } from "@/modules/search-console/collect";
import { searchConsoleSnapshots, type SearchConsoleSnapshot } from "@/modules/search-console/schema";
import { getWorkspace } from "@/modules/workspaces/service";

export interface SearchConsoleDeps {
  /** Null when no credential is configured: nothing is called and nothing is stored. */
  collect(site: { domain: string; hostname: string }): Promise<CollectOutcome> | null;
}

export type RefreshResult = { ok: true; snapshot: SearchConsoleSnapshot } | { ok: false; error: "not_found" | "not_configured" };

const FK_VIOLATION = "23503";

export async function refreshSearchConsole(db: Database, workspaceId: string, deps: SearchConsoleDeps): Promise<RefreshResult> {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: "not_found" };
  const pending = deps.collect({ domain: workspace.domain, hostname: workspace.hostname });
  if (!pending) return { ok: false, error: "not_configured" };
  const outcome = await pending;

  const values: typeof searchConsoleSnapshots.$inferInsert = outcome.ok
    ? {
        workspaceId: workspace.id,
        status: "completed",
        property: outcome.data.property,
        currentStart: outcome.data.current.start,
        currentEnd: outcome.data.current.end,
        previousStart: outcome.data.previous.start,
        previousEnd: outcome.data.previous.end,
        totals: outcome.data.totals,
        previousTotals: outcome.data.previousTotals,
        queries: outcome.data.queries,
        pages: outcome.data.pages,
      }
    : {
        workspaceId: workspace.id,
        status: "failed",
        property: outcome.property,
        errorKind: outcome.kind,
        errorMessage: outcome.message,
        accessibleProperties: outcome.accessibleProperties,
      };

  try {
    const [snapshot] = await db.insert(searchConsoleSnapshots).values(values).returning();
    return { ok: true, snapshot: snapshot! };
  } catch (error) {
    // The company was deleted while Google answered: nothing to attach the result to.
    const code = (error as { code?: unknown; cause?: { code?: unknown } })?.code ?? (error as { cause?: { code?: unknown } })?.cause?.code;
    if (code === FK_VIOLATION) return { ok: false, error: "not_found" };
    throw error;
  }
}

export interface LatestSearchConsole {
  /** Most recent attempt, whatever its outcome. */
  latest: SearchConsoleSnapshot | null;
  /** Most recent successful capture; stays visible after a later failure. */
  latestCompleted: SearchConsoleSnapshot | null;
}

export async function latestSearchConsole(db: Database, workspaceId: string): Promise<LatestSearchConsole> {
  const byNewest = desc(searchConsoleSnapshots.createdAt);
  const [[latest], [latestCompleted]] = await Promise.all([
    db.select().from(searchConsoleSnapshots).where(eq(searchConsoleSnapshots.workspaceId, workspaceId)).orderBy(byNewest).limit(1),
    db
      .select()
      .from(searchConsoleSnapshots)
      .where(and(eq(searchConsoleSnapshots.workspaceId, workspaceId), eq(searchConsoleSnapshots.status, "completed")))
      .orderBy(byNewest)
      .limit(1),
  ]);
  return { latest: latest ?? null, latestCompleted: latestCompleted ?? null };
}
