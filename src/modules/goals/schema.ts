import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "@/modules/workspaces/schema";

/** What a company counts as a result (feature 016): one per company, optional. */
export const GOAL_KINDS = ["request", "booking", "purchase", "other"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_LIMITS = { label: 80, event: 200 } as const;

/**
 * The commercial goal of a company and the GA4 key event that measures it. Whether it is
 * verified is never stored: it is derived from the analytics captures (D002).
 */
export const workspaceGoals = pgTable(
  "workspace_goals",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: GOAL_KINDS }).$type<GoalKind>().notNull(),
    /** How the owner calls it: «Solicitud de presupuesto». */
    label: text("label").notNull(),
    /** Exact GA4 event name; GA4 is case sensitive. */
    eventName: text("event_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "workspace_goals_kind_valid",
      sql`${t.kind} in ('request', 'booking', 'purchase', 'other')`,
    ),
    check(
      "workspace_goals_label_length",
      sql`length(btrim(${t.label})) between 1 and 80`,
    ),
    check(
      "workspace_goals_event_length",
      sql`${t.eventName} = btrim(${t.eventName}) and length(${t.eventName}) between 1 and 200`,
    ),
  ],
);

export type WorkspaceGoal = typeof workspaceGoals.$inferSelect;
