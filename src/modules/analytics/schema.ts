import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ChannelRow, PageRow, Totals } from "@/modules/analytics/collect";
import type { Quality } from "@/modules/analytics/ga4";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * One row per Google Analytics 4 capture attempt, successful or not. Owner data from GA4's
 * official APIs (`capture_condition = owner_api`), read with the operator's service account.
 */
export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    provider: text("provider").notNull().default("ga4"),
    captureCondition: text("capture_condition").notNull().default("owner_api"),
    /** GA4 property used, e.g. "properties/123456789". */
    property: text("property"),
    propertyName: text("property_name"),
    currentStart: date("current_start", { mode: "string" }),
    currentEnd: date("current_end", { mode: "string" }),
    previousStart: date("previous_start", { mode: "string" }),
    previousEnd: date("previous_end", { mode: "string" }),
    totals: jsonb("totals").$type<Totals>(),
    previousTotals: jsonb("previous_totals").$type<Totals>(),
    channels: jsonb("channels").$type<ChannelRow[]>().notNull().default(sql`'[]'::jsonb`),
    pages: jsonb("pages").$type<PageRow[]>().notNull().default(sql`'[]'::jsonb`),
    quality: jsonb("quality").$type<Quality>(),
    errorKind: text("error_kind", { enum: ["invalid_credentials", "admin_api_disabled", "data_api_disabled", "no_access", "quota_exceeded", "error"] }),
    errorMessage: text("error_message"),
    accessibleProperties: integer("accessible_properties"),
    propertiesSkipped: boolean("properties_skipped"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("analytics_snapshots_workspace_created_idx").on(t.workspaceId, t.createdAt.desc()),
    check("analytics_snapshots_status_valid", sql`${t.status} in ('completed', 'failed')`),
    check(
      "analytics_snapshots_error_kind_valid",
      sql`${t.errorKind} is null or ${t.errorKind} in ('invalid_credentials', 'admin_api_disabled', 'data_api_disabled', 'no_access', 'quota_exceeded', 'error')`,
    ),
    check(
      "analytics_snapshots_completed_complete",
      sql`${t.status} <> 'completed' or (${t.property} is not null and ${t.errorKind} is null and num_nulls(${t.currentStart}, ${t.currentEnd}, ${t.previousStart}, ${t.previousEnd}, ${t.totals}, ${t.previousTotals}, ${t.quality}) = 0)`,
    ),
    check("analytics_snapshots_failed_has_reason", sql`${t.status} <> 'failed' or (${t.errorKind} is not null and ${t.errorMessage} is not null)`),
    check("analytics_snapshots_rows_are_arrays", sql`jsonb_typeof(${t.channels}) = 'array' and jsonb_typeof(${t.pages}) = 'array'`),
  ],
);

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
