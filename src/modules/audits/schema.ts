import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { FetchLogEntry } from "@/modules/audits/fetcher/safe-fetch";
import type { AuditFacts } from "@/modules/audits/rules";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * One technical audit of a workspace's home page (Phase 2). The raw HTML is never stored:
 * only bounded, plain-text facts extracted from it, the findings and the request log.
 */
export const audits = pgTable(
  "audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** running → completed | failed. "failed" means an internal error, not an unreachable site. */
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
    requestedUrl: text("requested_url").notNull(),
    finalUrl: text("final_url"),
    rulesVersion: text("rules_version").notNull(),
    facts: jsonb("facts").$type<AuditFacts>(),
    fetchLog: jsonb("fetch_log").$type<FetchLogEntry[]>().notNull().default([]),
    criticalCount: integer("critical_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    infoCount: integer("info_count").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check("audits_status_valid", sql`${table.status} in ('running', 'completed', 'failed')`),
    check("audits_finished_consistent", sql`(${table.status} = 'running') = (${table.finishedAt} is null)`),
    // At most one audit in progress per workspace: concurrent requests cannot both run.
    uniqueIndex("audits_one_running_per_workspace").on(table.workspaceId).where(sql`${table.status} = 'running'`),
    index("audits_workspace_started_idx").on(table.workspaceId, table.startedAt.desc()),
  ],
);

export const auditFindings = pgTable(
  "audit_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    ruleId: text("rule_id").notNull(),
    severity: text("severity", { enum: ["critical", "warning", "info"] }).notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull(),
    recommendation: text("recommendation").notNull(),
  },
  (table) => [
    check("audit_findings_severity_valid", sql`${table.severity} in ('critical', 'warning', 'info')`),
    uniqueIndex("audit_findings_audit_position_key").on(table.auditId, table.position),
  ],
);

export type Audit = typeof audits.$inferSelect;
export type AuditFinding = typeof auditFindings.$inferSelect;
