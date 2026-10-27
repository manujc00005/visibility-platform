import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { PageRow, QueryRow, Totals } from "@/modules/search-console/collect";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * One row per Search Console capture attempt, successful or not (D004). Owner data from
 * Google's official API (`capture_condition = owner_api`), never mixed with SERP or AI series.
 */
export const searchConsoleSnapshots = pgTable(
  "search_console_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    provider: text("provider").notNull().default("google_gsc"),
    captureCondition: text("capture_condition").notNull().default("owner_api"),
    /** Search Console property used, e.g. "sc-domain:olessium.com". */
    property: text("property"),
    currentStart: date("current_start", { mode: "string" }),
    currentEnd: date("current_end", { mode: "string" }),
    previousStart: date("previous_start", { mode: "string" }),
    previousEnd: date("previous_end", { mode: "string" }),
    totals: jsonb("totals").$type<Totals>(),
    previousTotals: jsonb("previous_totals").$type<Totals>(),
    queries: jsonb("queries").$type<QueryRow[]>().notNull().default(sql`'[]'::jsonb`),
    pages: jsonb("pages").$type<PageRow[]>().notNull().default(sql`'[]'::jsonb`),
    errorKind: text("error_kind", { enum: ["invalid_credentials", "api_disabled", "no_access", "quota_exceeded", "error"] }),
    errorMessage: text("error_message"),
    accessibleProperties: integer("accessible_properties"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("search_console_snapshots_workspace_created_idx").on(t.workspaceId, t.createdAt.desc()),
    check("search_console_snapshots_status_valid", sql`${t.status} in ('completed', 'failed')`),
    check(
      "search_console_snapshots_error_kind_valid",
      sql`${t.errorKind} is null or ${t.errorKind} in ('invalid_credentials', 'api_disabled', 'no_access', 'quota_exceeded', 'error')`,
    ),
    check(
      "search_console_snapshots_completed_complete",
      sql`${t.status} <> 'completed' or (${t.property} is not null and ${t.currentStart} is not null and ${t.currentEnd} is not null and ${t.previousStart} is not null and ${t.previousEnd} is not null and ${t.totals} is not null and ${t.previousTotals} is not null and ${t.errorKind} is null)`,
    ),
    check("search_console_snapshots_failed_has_reason", sql`${t.status} <> 'failed' or (${t.errorKind} is not null and ${t.errorMessage} is not null)`),
    check("search_console_snapshots_rows_are_arrays", sql`jsonb_typeof(${t.queries}) = 'array' and jsonb_typeof(${t.pages}) = 'array'`),
  ],
);

export type SearchConsoleSnapshot = typeof searchConsoleSnapshots.$inferSelect;
