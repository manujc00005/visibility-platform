import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { PageRow, QueryRow, Totals } from "@/modules/bing-webmaster/collect";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * One row per Bing Webmaster capture attempt, successful or not. Owner data from Bing's official
 * API (`capture_condition = owner_api`). Own table rather than Search Console's (D002): a
 * completed capture may have no traffic yet, and the query/page rows cover their own window.
 */
export const bingWebmasterSnapshots = pgTable(
  "bing_webmaster_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    provider: text("provider").notNull().default("bing_wmt"),
    captureCondition: text("capture_condition").notNull().default("owner_api"),
    /** Bing site used, exactly as GetUserSites returned it, e.g. "https://olessium.com/". */
    siteUrl: text("site_url"),
    currentStart: date("current_start", { mode: "string" }),
    currentEnd: date("current_end", { mode: "string" }),
    previousStart: date("previous_start", { mode: "string" }),
    previousEnd: date("previous_end", { mode: "string" }),
    totals: jsonb("totals").$type<Totals>(),
    previousTotals: jsonb("previous_totals").$type<Totals>(),
    queries: jsonb("queries").$type<QueryRow[]>().notNull().default(sql`'[]'::jsonb`),
    pages: jsonb("pages").$type<PageRow[]>().notNull().default(sql`'[]'::jsonb`),
    /** Days covered by the query and page rows (D005). */
    rowsStart: date("rows_start", { mode: "string" }),
    rowsEnd: date("rows_end", { mode: "string" }),
    errorKind: text("error_kind", { enum: ["invalid_credentials", "quota_exceeded", "no_access", "not_verified", "error"] }),
    errorMessage: text("error_message"),
    verifiedSites: integer("verified_sites"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bing_webmaster_snapshots_workspace_created_idx").on(t.workspaceId, t.createdAt.desc()),
    check("bing_webmaster_snapshots_status_valid", sql`${t.status} in ('completed', 'failed')`),
    check(
      "bing_webmaster_snapshots_error_kind_valid",
      sql`${t.errorKind} is null or ${t.errorKind} in ('invalid_credentials', 'quota_exceeded', 'no_access', 'not_verified', 'error')`,
    ),
    // Traffic is all or nothing: a site Bing is still processing has none of it.
    check(
      "bing_webmaster_snapshots_completed_complete",
      sql`${t.status} <> 'completed' or (${t.siteUrl} is not null and ${t.errorKind} is null and num_nulls(${t.currentStart}, ${t.currentEnd}, ${t.previousStart}, ${t.previousEnd}, ${t.totals}, ${t.previousTotals}) in (0, 6))`,
    ),
    check("bing_webmaster_snapshots_failed_has_reason", sql`${t.status} <> 'failed' or (${t.errorKind} is not null and ${t.errorMessage} is not null)`),
    check("bing_webmaster_snapshots_rows_are_arrays", sql`jsonb_typeof(${t.queries}) = 'array' and jsonb_typeof(${t.pages}) = 'array'`),
    check("bing_webmaster_snapshots_rows_window", sql`num_nulls(${t.rowsStart}, ${t.rowsEnd}) in (0, 2)`),
  ],
);

export type BingWebmasterSnapshot = typeof bingWebmasterSnapshots.$inferSelect;
