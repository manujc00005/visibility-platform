import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * Strict mode, as in the brand segments (feature 007): a wrong structure makes the filter unknown,
 * and only `is true` passes. SQL holds the outer shape; `parseComparison` holds everything inside.
 */
const SITES_SHAPE = ['@.type() == "object"', '@.version.type() == "number"', "@.version == 1", '@.sites.type() == "array"', "@.sites.size() >= 1", "@.sites.size() <= 6"].join(" && ");

/**
 * One row per comparison attempt (feature 011). Metrics and states only: never the text of a
 * website. `failed` means this process broke, not that a website or a provider did.
 */
export const competitorComparisons = pgTable(
  "competitor_comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** running → completed | failed. */
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
    /** `Comparison` of sites.ts; read it through `parseComparison`. */
    sites: jsonb("sites").$type<unknown>(),
    rulesVersion: text("rules_version").notNull(),
    error: text("error", { enum: ["internal_error", "interrupted"] }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    check("competitor_comparisons_status_valid", sql`${t.status} in ('running', 'completed', 'failed')`),
    check("competitor_comparisons_error_valid", sql`${t.error} is null or ${t.error} in ('internal_error', 'interrupted')`),
    check("competitor_comparisons_sites_only_completed", sql`(${t.status} = 'completed') = (${t.sites} is not null)`),
    check("competitor_comparisons_error_only_failed", sql`(${t.status} = 'failed') = (${t.error} is not null)`),
    check(
      "competitor_comparisons_finished_consistent",
      sql`(${t.status} = 'running') = (${t.finishedAt} is null) and (${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt})`,
    ),
    check("competitor_comparisons_sites_shape", sql`${t.sites} is null or jsonb_path_exists(${t.sites}, ${sql.raw(`'strict $ ? (${SITES_SHAPE})'`)}, '{}', true) is true`),
    uniqueIndex("competitor_comparisons_one_running_per_workspace").on(t.workspaceId).where(sql`${t.status} = 'running'`),
    index("competitor_comparisons_workspace_started_idx").on(t.workspaceId, t.startedAt.desc(), t.id.desc()),
  ],
);

export type CompetitorComparison = typeof competitorComparisons.$inferSelect;
