import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ChannelRow, KeyEvents, PageRow, Totals } from "@/modules/analytics/collect";
import type { Quality } from "@/modules/analytics/ga4";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * Shape of `key_events` (feature 008), in strict JSON path mode like `segments` of 007 (its
 * D008): lax mode would unwrap arrays where a value or an object is expected.
 */
const KEY_EVENTS_SHAPE = [
  "@.version == 1",
  '@.configured.type() == "array"',
  '!exists(@.configured[*] ? (@.type() != "string"))',
  '@.configuredMore.type() == "boolean"',
  ...["total", "previousTotal", "organic", "previousOrganic"].map((key) => `@.${key}.type() == "number"`),
  '@.organicByEvent.type() == "array"',
].join(" && ");
/**
 * Well-formed breakdown items. An item missing `event` makes its filter unknown, which only
 * leaves the item out; so the check compares how many items pass with how many there are.
 */
const GOOD_EVENT = 'strict $.organicByEvent[*] ? (@.type() == "object" && @.event.type() == "string" && @.keyEvents.type() == "number")';

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
    /** Key events (feature 008). Null in failed rows and in captures taken before it. */
    keyEvents: jsonb("key_events").$type<KeyEvents>(),
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
    check("analytics_snapshots_failed_without_key_events", sql`${t.status} <> 'failed' or ${t.keyEvents} is null`),
    check(
      "analytics_snapshots_key_events_shape",
      // CASE fixes the order: jsonb_array_length would raise on a value that is not an array.
      sql`${t.keyEvents} is null or (jsonb_typeof(${t.keyEvents}) = 'object' and jsonb_path_exists(${t.keyEvents}, ${sql.raw(`'strict $ ? (${KEY_EVENTS_SHAPE})'`)}) and case when jsonb_typeof(${t.keyEvents} -> 'organicByEvent') = 'array' then jsonb_array_length(${t.keyEvents} -> 'organicByEvent') = jsonb_array_length(jsonb_path_query_array(${t.keyEvents}, ${sql.raw(`'${GOOD_EVENT}'`)})) else false end)`,
    ),
  ],
);

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
