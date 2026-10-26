import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { geoCompetitors } from "@/modules/geo/schema";
import { workspaces } from "@/modules/workspaces/schema";

/**
 * Competitor discovery from an assisted ChatGPT capture. Separate from GEO measurements
 * on purpose: nothing here counts towards capture, answers or share of voice, and no
 * provider spend is involved. Rows are scoped by workspace everywhere.
 */

/** Company record frozen at extraction time, so the result stays explainable after edits. */
export interface ExtractionContext {
  brandName: string;
  aliases: string[];
  /** Workspace hostname without "www." (the uniqueness key of the company). */
  hostname: string;
  sector: string;
  city: string | null;
  countryCode: string;
  countryName: string;
  services: string[];
}

export type FactorState = "matched" | "unknown" | "conflicting";

export interface FactorEvidence {
  state: FactorState;
  /** Owner-readable reason. */
  reason: string;
  /** Matched terms, bounded. */
  terms?: string[];
  /** Where the evidence came from: "title" | "description" | "jsonld" | "none". */
  origin?: string;
}

export interface SuggestionFactors {
  sector: FactorEvidence;
  zone: FactorEvidence;
  services: FactorEvidence;
  /** Informational only: declared page language, never used to exclude. */
  language: string | null;
  /** Review hints shown to the operator (unknown factors, provisional name, ambiguous association). */
  review: string[];
}

export type WebStatus = "reachable" | "unreachable" | "unverified" | "blocked";

export interface AcceptedInput {
  name: string;
  website: string | null;
  /** True when the operator changed name or website versus the suggestion. */
  corrected: boolean;
  /** "operator_provided_unverified" when the website was corrected; evidence is never inherited. */
  websiteStatus: "as_suggested" | "operator_provided_unverified" | "none";
  reviewConfirmed: true;
}

export const geoCompetitorExtractions = pgTable(
  "geo_competitor_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["assisted"] }).notNull().default("assisted"),
    question: text("question").notNull(),
    answerSha256: text("answer_sha256").notNull(),
    /** SHA-256 over company, question, answer hash, canonical sources, context and rules version (FR-010). */
    inputFingerprint: text("input_fingerprint").notNull(),
    sources: jsonb("sources").$type<string[]>().notNull(),
    rulesVersion: text("rules_version").notNull(),
    contextSnapshot: jsonb("context_snapshot").$type<ExtractionContext>().notNull(),
    candidatesTotal: integer("candidates_total").notNull().default(0),
    candidatesShown: integer("candidates_shown").notNull().default(0),
    warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("geo_competitor_extractions_source_valid", sql`${t.source} in ('assisted')`),
    check("geo_competitor_extractions_question_length", sql`length(${t.question}) between 1 and 500`),
    check("geo_competitor_extractions_answer_sha256_hex", sql`${t.answerSha256} ~ '^[0-9a-f]{64}$'`),
    check("geo_competitor_extractions_fingerprint_hex", sql`${t.inputFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("geo_competitor_extractions_counts_non_negative", sql`${t.candidatesTotal} >= 0 and ${t.candidatesShown} >= 0`),
    uniqueIndex("geo_competitor_extractions_fingerprint_key").on(t.workspaceId, t.inputFingerprint),
    // Table constraint (not an index) so the composite FK from suggestions can reference it at creation time.
    unique("geo_competitor_extractions_workspace_id_key").on(t.workspaceId, t.id),
    index("geo_competitor_extractions_workspace_created_idx").on(t.workspaceId, t.createdAt.desc(), t.id.desc()),
  ],
);

export const geoCompetitorSuggestions = pgTable(
  "geo_competitor_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    extractionId: uuid("extraction_id").notNull(),
    /** "host:<hostname>" or "name:<normalized name>", unique within an extraction. */
    candidateKey: text("candidate_key").notNull(),
    name: text("name").notNull(),
    /** Candidate hostname without "www." (never called a registrable domain), or null. */
    domain: text("domain"),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    snippet: text("snippet").notNull().default(""),
    pageTitle: text("page_title"),
    pageDescription: text("page_description"),
    factors: jsonb("factors").$type<SuggestionFactors>().notNull(),
    webStatus: text("web_status", { enum: ["reachable", "unreachable", "unverified", "blocked"] }).$type<WebStatus>(),
    initialUrl: text("initial_url"),
    finalUrl: text("final_url"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    status: text("status", { enum: ["suggested", "accepted", "dismissed", "superseded"] }).notNull().default("suggested"),
    /** Simple FK: workspace ownership is re-checked inside the accepting transaction. */
    competitorId: uuid("competitor_id").references(() => geoCompetitors.id, { onDelete: "set null" }),
    acceptedInput: jsonb("accepted_input").$type<AcceptedInput>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: "geo_competitor_suggestions_extraction_fk",
      columns: [t.workspaceId, t.extractionId],
      foreignColumns: [geoCompetitorExtractions.workspaceId, geoCompetitorExtractions.id],
    }).onDelete("cascade"),
    check("geo_competitor_suggestions_status_valid", sql`${t.status} in ('suggested', 'accepted', 'dismissed', 'superseded')`),
    check("geo_competitor_suggestions_web_status_valid", sql`${t.webStatus} is null or ${t.webStatus} in ('reachable', 'unreachable', 'unverified', 'blocked')`),
    check("geo_competitor_suggestions_key_prefixed", sql`${t.candidateKey} ~ '^(host|name):.'`),
    check("geo_competitor_suggestions_name_length", sql`length(btrim(${t.name})) between 1 and 120`),
    check("geo_competitor_suggestions_snippet_length", sql`length(${t.snippet}) <= 200`),
    check("geo_competitor_suggestions_title_length", sql`${t.pageTitle} is null or length(${t.pageTitle}) <= 120`),
    check("geo_competitor_suggestions_description_length", sql`${t.pageDescription} is null or length(${t.pageDescription}) <= 500`),
    check(
      "geo_competitor_suggestions_accepted_complete",
      sql`${t.status} <> 'accepted' or (${t.decidedAt} is not null and ${t.acceptedInput} is not null)`,
    ),
    check("geo_competitor_suggestions_decided_when_final", sql`${t.status} in ('suggested', 'superseded') or ${t.decidedAt} is not null`),
    uniqueIndex("geo_competitor_suggestions_extraction_key").on(t.extractionId, t.candidateKey),
    index("geo_competitor_suggestions_workspace_status_idx").on(t.workspaceId, t.status),
  ],
);

export const geoCompetitorDismissals = pgTable(
  "geo_competitor_dismissals",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    /** "host:<hostname>" or "name:<normalized name>". */
    identityKey: text("identity_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "geo_competitor_dismissals_pkey", columns: [t.workspaceId, t.identityKey] }),
    check("geo_competitor_dismissals_key_prefixed", sql`${t.identityKey} ~ '^(host|name):.'`),
  ],
);

export type GeoCompetitorExtraction = typeof geoCompetitorExtractions.$inferSelect;
export type GeoCompetitorSuggestion = typeof geoCompetitorSuggestions.$inferSelect;
