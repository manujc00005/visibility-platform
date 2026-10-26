CREATE TABLE "geo_competitor_dismissals" (
	"workspace_id" uuid NOT NULL,
	"identity_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_competitor_dismissals_pkey" PRIMARY KEY("workspace_id","identity_key"),
	CONSTRAINT "geo_competitor_dismissals_key_prefixed" CHECK ("geo_competitor_dismissals"."identity_key" ~ '^(host|name):.')
);
--> statement-breakpoint
CREATE TABLE "geo_competitor_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text DEFAULT 'assisted' NOT NULL,
	"question" text NOT NULL,
	"answer_sha256" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"sources" jsonb NOT NULL,
	"rules_version" text NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"candidates_total" integer DEFAULT 0 NOT NULL,
	"candidates_shown" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_competitor_extractions_workspace_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "geo_competitor_extractions_source_valid" CHECK ("geo_competitor_extractions"."source" in ('assisted')),
	CONSTRAINT "geo_competitor_extractions_question_length" CHECK (length("geo_competitor_extractions"."question") between 1 and 500),
	CONSTRAINT "geo_competitor_extractions_answer_sha256_hex" CHECK ("geo_competitor_extractions"."answer_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geo_competitor_extractions_fingerprint_hex" CHECK ("geo_competitor_extractions"."input_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "geo_competitor_extractions_counts_non_negative" CHECK ("geo_competitor_extractions"."candidates_total" >= 0 and "geo_competitor_extractions"."candidates_shown" >= 0)
);
--> statement-breakpoint
CREATE TABLE "geo_competitor_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"extraction_id" uuid NOT NULL,
	"candidate_key" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"source_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"page_title" text,
	"page_description" text,
	"factors" jsonb NOT NULL,
	"web_status" text,
	"initial_url" text,
	"final_url" text,
	"checked_at" timestamp with time zone,
	"status" text DEFAULT 'suggested' NOT NULL,
	"competitor_id" uuid,
	"accepted_input" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "geo_competitor_suggestions_status_valid" CHECK ("geo_competitor_suggestions"."status" in ('suggested', 'accepted', 'dismissed', 'superseded')),
	CONSTRAINT "geo_competitor_suggestions_web_status_valid" CHECK ("geo_competitor_suggestions"."web_status" is null or "geo_competitor_suggestions"."web_status" in ('reachable', 'unreachable', 'unverified', 'blocked')),
	CONSTRAINT "geo_competitor_suggestions_key_prefixed" CHECK ("geo_competitor_suggestions"."candidate_key" ~ '^(host|name):.'),
	CONSTRAINT "geo_competitor_suggestions_name_length" CHECK (length(btrim("geo_competitor_suggestions"."name")) between 1 and 120),
	CONSTRAINT "geo_competitor_suggestions_snippet_length" CHECK (length("geo_competitor_suggestions"."snippet") <= 200),
	CONSTRAINT "geo_competitor_suggestions_title_length" CHECK ("geo_competitor_suggestions"."page_title" is null or length("geo_competitor_suggestions"."page_title") <= 120),
	CONSTRAINT "geo_competitor_suggestions_description_length" CHECK ("geo_competitor_suggestions"."page_description" is null or length("geo_competitor_suggestions"."page_description") <= 500),
	CONSTRAINT "geo_competitor_suggestions_accepted_complete" CHECK ("geo_competitor_suggestions"."status" <> 'accepted' or ("geo_competitor_suggestions"."decided_at" is not null and "geo_competitor_suggestions"."accepted_input" is not null)),
	CONSTRAINT "geo_competitor_suggestions_decided_when_final" CHECK ("geo_competitor_suggestions"."status" in ('suggested', 'superseded') or "geo_competitor_suggestions"."decided_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "geo_competitor_dismissals" ADD CONSTRAINT "geo_competitor_dismissals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_competitor_extractions" ADD CONSTRAINT "geo_competitor_extractions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_competitor_suggestions" ADD CONSTRAINT "geo_competitor_suggestions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_competitor_suggestions" ADD CONSTRAINT "geo_competitor_suggestions_competitor_id_geo_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."geo_competitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_competitor_suggestions" ADD CONSTRAINT "geo_competitor_suggestions_extraction_fk" FOREIGN KEY ("workspace_id","extraction_id") REFERENCES "public"."geo_competitor_extractions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geo_competitor_extractions_fingerprint_key" ON "geo_competitor_extractions" USING btree ("workspace_id","input_fingerprint");--> statement-breakpoint
CREATE INDEX "geo_competitor_extractions_workspace_created_idx" ON "geo_competitor_extractions" USING btree ("workspace_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "geo_competitor_suggestions_extraction_key" ON "geo_competitor_suggestions" USING btree ("extraction_id","candidate_key");--> statement-breakpoint
CREATE INDEX "geo_competitor_suggestions_workspace_status_idx" ON "geo_competitor_suggestions" USING btree ("workspace_id","status");