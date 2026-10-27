import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { audits } from "@/modules/audits/schema";
import { geoRuns } from "@/modules/geo/schema";
import { workspaces } from "@/modules/workspaces/schema";
import type { WorkspaceRoute } from "@/modules/routing/workspace-route";

/** Primary-key lookups only (one or two queries); nested records must belong to the workspace. */
export async function workspaceRouteExists(db: Database, route: Extract<WorkspaceRoute, { kind: "check" }>): Promise<boolean> {
  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, route.workspaceId)).limit(1);
  if (!workspace) return false;
  if (route.auditId) {
    const [audit] = await db
      .select({ id: audits.id })
      .from(audits)
      .where(and(eq(audits.id, route.auditId), eq(audits.workspaceId, route.workspaceId)))
      .limit(1);
    return Boolean(audit);
  }
  if (route.runId) {
    const [run] = await db
      .select({ id: geoRuns.id })
      .from(geoRuns)
      .where(and(eq(geoRuns.id, route.runId), eq(geoRuns.workspaceId, route.workspaceId)))
      .limit(1);
    return Boolean(run);
  }
  return true;
}
