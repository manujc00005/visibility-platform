CREATE TABLE "geo_business_profiles" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"offerings" text[] DEFAULT '{}'::text[] NOT NULL,
	"customer_type" text NOT NULL,
	"target_customer" text NOT NULL,
	"zone_relevance" text NOT NULL,
	"served_area" text,
	"competitor_kinds" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_business_profiles_summary_length" CHECK (length(btrim("geo_business_profiles"."summary")) between 1 and 400),
	CONSTRAINT "geo_business_profiles_offerings_count" CHECK (cardinality("geo_business_profiles"."offerings") <= 10),
	CONSTRAINT "geo_business_profiles_customer_type_valid" CHECK ("geo_business_profiles"."customer_type" in ('b2b', 'b2c', 'both')),
	CONSTRAINT "geo_business_profiles_target_length" CHECK (length(btrim("geo_business_profiles"."target_customer")) between 1 and 200),
	CONSTRAINT "geo_business_profiles_zone_valid" CHECK ("geo_business_profiles"."zone_relevance" in ('local', 'regional', 'national', 'international')),
	CONSTRAINT "geo_business_profiles_area_length" CHECK ("geo_business_profiles"."served_area" is null or length(btrim("geo_business_profiles"."served_area")) between 1 and 120),
	CONSTRAINT "geo_business_profiles_area_required" CHECK ("geo_business_profiles"."zone_relevance" not in ('local', 'regional') or "geo_business_profiles"."served_area" is not null),
	CONSTRAINT "geo_business_profiles_kinds_valid" CHECK (cardinality("geo_business_profiles"."competitor_kinds") between 1 and 3 and "geo_business_profiles"."competitor_kinds" <@ array['direct', 'indirect', 'substitute']::text[])
);
--> statement-breakpoint
ALTER TABLE "geo_competitor_extractions" DROP CONSTRAINT "geo_competitor_extractions_question_length";--> statement-breakpoint
ALTER TABLE "geo_competitors" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "geo_competitor_suggestions" ADD COLUMN "competitor_kind" text;--> statement-breakpoint
ALTER TABLE "geo_business_profiles" ADD CONSTRAINT "geo_business_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_competitors" ADD CONSTRAINT "geo_competitors_kind_valid" CHECK ("geo_competitors"."kind" is null or "geo_competitors"."kind" in ('direct', 'indirect', 'substitute'));--> statement-breakpoint
ALTER TABLE "geo_competitor_extractions" ADD CONSTRAINT "geo_competitor_extractions_question_length" CHECK (length("geo_competitor_extractions"."question") between 1 and 2000);--> statement-breakpoint
ALTER TABLE "geo_competitor_suggestions" ADD CONSTRAINT "geo_competitor_suggestions_kind_valid" CHECK ("geo_competitor_suggestions"."competitor_kind" is null or "geo_competitor_suggestions"."competitor_kind" in ('direct', 'indirect', 'substitute'));