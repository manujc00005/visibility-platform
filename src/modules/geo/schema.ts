import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ClassifiedSource, Mentions, BrandPanel } from "@/modules/geo/detection";
import type { PromptIntent } from "@/modules/geo/prompt-suggestions";
import { workspaces } from "@/modules/workspaces/schema";

/** Competitors confirmed by the operator. Archived instead of deleted, so history stays interpretable. */
export const geoCompetitors = pgTable(
  "geo_competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    /** ASCII domain without "www.", normalized like workspace domains. */
    domain: text("domain"),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("geo_competitors_status_valid", sql`${t.status} in ('active', 'archived')`),
    check("geo_competitors_name_not_blank", sql`length(btrim(${t.name})) between 1 and 120`),
    index("geo_competitors_workspace_idx").on(t.workspaceId),
  ],
);

/** Questions approved by the operator. Immutable text: an edit archives the row and creates a new one. */
export const geoPrompts = pgTable(
  "geo_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    intent: text("intent", { enum: ["discovery", "recommendation", "comparison", "branded"] }).$type<PromptIntent>().notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("geo_prompts_intent_valid", sql`${t.intent} in ('discovery', 'recommendation', 'comparison', 'branded')`),
    check("geo_prompts_status_valid", sql`${t.status} in ('active', 'archived')`),
    check("geo_prompts_text_length", sql`length(btrim(${t.text})) between 5 and 400`),
    index("geo_prompts_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * Everything that defines how a measurement was taken, frozen at creation (B05): panel,
 * questions, provider parameters and versions. Results are only comparable between runs
 * with the same `methodologyKey`.
 */
export interface GeoRunConfig {
  methodologyVersion: string;
  normalizerVersion: string;
  provider: "manual" | "dataforseo_chatgpt";
  surface: "chatgpt";
  captureCondition: "manual_ui" | "ui_scraper";
  repetitions: number;
  location: { countryCode: string; locationName: string; languageCode: string };
  providerParams: Record<string, string | number | boolean>;
  panel: BrandPanel;
  prompts: { id: string; text: string; intent: PromptIntent }[];
}

export const geoRuns = pgTable(
  "geo_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["manual", "dataforseo_chatgpt"] }).notNull(),
    status: text("status", { enum: ["collecting", "completed"] }).notNull().default("collecting"),
    config: jsonb("config").$type<GeoRunConfig>().notNull(),
    /** SHA-256 of the canonical config: equal key = comparable measurements. */
    methodologyKey: text("methodology_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    check("geo_runs_provider_valid", sql`${t.provider} in ('manual', 'dataforseo_chatgpt')`),
    check("geo_runs_status_valid", sql`${t.status} in ('collecting', 'completed')`),
    index("geo_runs_workspace_created_idx").on(t.workspaceId, t.createdAt.desc()),
  ],
);

export const geoObservations = pgTable(
  "geo_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => geoRuns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** Prompt id as frozen in the run config. */
    promptId: text("prompt_id").notNull(),
    repetition: integer("repetition").notNull(),
    /** pending → submitted → completed | failed; uncertain = we may have paid but cannot tell yet. */
    status: text("status", { enum: ["pending", "submitted", "completed", "failed", "uncertain"] }).notNull().default("pending"),
    /** Our identifier sent to the provider as `tag`, used to reconcile lost responses. */
    tag: text("tag").notNull(),
    providerTaskId: text("provider_task_id"),
    responseText: text("response_text"),
    answerPresent: boolean("answer_present"),
    sources: jsonb("sources").$type<ClassifiedSource[]>(),
    mentions: jsonb("mentions").$type<Mentions>(),
    ownCited: boolean("own_cited"),
    competitorsCited: jsonb("competitors_cited").$type<string[]>(),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }),
    error: text("error"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }),
  },
  (t) => [
    check("geo_observations_status_valid", sql`${t.status} in ('pending', 'submitted', 'completed', 'failed', 'uncertain')`),
    check("geo_observations_repetition_valid", sql`${t.repetition} between 1 and 10`),
    uniqueIndex("geo_observations_run_prompt_rep_key").on(t.runId, t.promptId, t.repetition),
    uniqueIndex("geo_observations_tag_key").on(t.tag),
    index("geo_observations_run_idx").on(t.runId),
  ],
);

/**
 * Ledger of money committed to paid providers (B04). Exact integer micro-USD. Rows survive
 * workspace deletion (financial record). Reserved, settled and uncertain rows all count
 * against the budget; only released rows do not.
 */
export const providerSpend = pgTable(
  "provider_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => geoRuns.id, { onDelete: "set null" }),
    observationId: uuid("observation_id").references(() => geoObservations.id, { onDelete: "set null" }),
    amountMicroUsd: bigint("amount_micro_usd", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status", { enum: ["reserved", "settled", "released", "uncertain"] }).notNull().default("reserved"),
    priceVersion: text("price_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    check("provider_spend_amount_non_negative", sql`${t.amountMicroUsd} >= 0`),
    check("provider_spend_currency_usd", sql`${t.currency} = 'USD'`),
    check("provider_spend_status_valid", sql`${t.status} in ('reserved', 'settled', 'released', 'uncertain')`),
    index("provider_spend_created_idx").on(t.createdAt),
    index("provider_spend_observation_idx").on(t.observationId),
  ],
);

export type GeoCompetitor = typeof geoCompetitors.$inferSelect;
export type GeoPrompt = typeof geoPrompts.$inferSelect;
export type GeoRun = typeof geoRuns.$inferSelect;
export type GeoObservation = typeof geoObservations.$inferSelect;
