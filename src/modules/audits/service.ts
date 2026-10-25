import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { logger } from "@/lib/logger";
import { collectAuditFacts, type CollectDeps } from "@/modules/audits/collect";
import { evaluateAudit, RULES_VERSION } from "@/modules/audits/rules";
import { auditFindings, audits, type Audit, type AuditFinding } from "@/modules/audits/schema";
import { getWorkspace } from "@/modules/workspaces/service";

export type RunAuditResult =
  | { ok: true; audit: Audit }
  | { ok: false; error: { kind: "not_found" } | { kind: "already_running"; auditId: string | null } };

/** An audit left "running" longer than this is assumed dead (process crash) and closed as failed. */
export const STALE_RUNNING_AFTER_MS = 10 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOneRunningViolation(error: unknown): boolean {
  const pgError = (error instanceof Error && error.cause ? error.cause : error) as { code?: string; constraint?: string };
  return pgError?.code === "23505" && pgError.constraint === "audits_one_running_per_workspace";
}

async function closeStaleRuns(db: Database, workspaceId: string): Promise<void> {
  const closed = await db
    .update(audits)
    .set({ status: "failed", error: "La auditoría se interrumpió y no terminó.", finishedAt: sql`now()` })
    .where(
      and(
        eq(audits.workspaceId, workspaceId),
        eq(audits.status, "running"),
        lt(audits.startedAt, sql`now() - ${`${STALE_RUNNING_AFTER_MS / 1000} seconds`}::interval`),
      ),
    )
    .returning({ id: audits.id });
  if (closed.length) logger.warn({ workspaceId, auditIds: closed.map((a) => a.id) }, "stale audits closed as failed");
}

/**
 * Runs one audit synchronously and stores its outcome. An unreachable website is a
 * completed audit with a critical finding; "failed" is reserved for internal errors.
 */
export async function runAudit(db: Database, workspaceId: string, deps: CollectDeps): Promise<RunAuditResult> {
  const workspace = await getWorkspace(db, workspaceId);
  if (!workspace) return { ok: false, error: { kind: "not_found" } };

  await closeStaleRuns(db, workspaceId);

  let audit: Audit;
  try {
    [audit] = (await db
      .insert(audits)
      .values({ workspaceId, requestedUrl: `https://${workspace.hostname}/`, rulesVersion: RULES_VERSION })
      .returning()) as [Audit];
  } catch (error) {
    if (!isOneRunningViolation(error)) throw error;
    const [running] = await db
      .select({ id: audits.id })
      .from(audits)
      .where(and(eq(audits.workspaceId, workspaceId), eq(audits.status, "running")));
    return { ok: false, error: { kind: "already_running", auditId: running?.id ?? null } };
  }

  const started = Date.now();
  try {
    const { facts, log } = await collectAuditFacts(workspace.hostname, deps);
    const findings = evaluateAudit(facts);
    const count = (severity: string) => findings.filter((f) => f.severity === severity).length;

    const completed = await db.transaction(async (tx) => {
      if (findings.length > 0) {
        await tx.insert(auditFindings).values(findings.map((finding, position) => ({ auditId: audit.id, position, ...finding })));
      }
      const [row] = await tx
        .update(audits)
        .set({
          status: "completed",
          finalUrl: facts.page.kind === "fetched" ? facts.page.result.url : null,
          facts,
          fetchLog: log,
          criticalCount: count("critical"),
          warningCount: count("warning"),
          infoCount: count("info"),
          finishedAt: sql`now()`,
        })
        .where(and(eq(audits.id, audit.id), eq(audits.status, "running")))
        .returning();
      return row;
    });
    if (!completed) throw new Error("Audit was closed by another process while running");
    logger.info(
      { workspaceId, auditId: audit.id, ms: Date.now() - started, findings: findings.length, requests: log.length },
      "audit completed",
    );
    return { ok: true, audit: completed };
  } catch (error) {
    logger.error({ err: error, workspaceId, auditId: audit.id }, "audit failed");
    const [failed] = await db
      .update(audits)
      .set({ status: "failed", error: "Error interno durante la auditoría.", finishedAt: sql`now()` })
      .where(and(eq(audits.id, audit.id), eq(audits.status, "running")))
      .returning();
    return { ok: true, audit: failed ?? audit };
  }
}

export async function listAudits(db: Database, workspaceId: string): Promise<Audit[]> {
  if (!UUID.test(workspaceId)) return [];
  return db.select().from(audits).where(eq(audits.workspaceId, workspaceId)).orderBy(desc(audits.startedAt));
}

/** Returns the audit only if it belongs to the given workspace. */
export async function getAudit(
  db: Database,
  workspaceId: string,
  auditId: string,
): Promise<{ audit: Audit; findings: AuditFinding[] } | null> {
  if (!UUID.test(workspaceId) || !UUID.test(auditId)) return null;
  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.workspaceId, workspaceId)));
  if (!audit) return null;
  const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId)).orderBy(asc(auditFindings.position));
  return { audit, findings };
}
