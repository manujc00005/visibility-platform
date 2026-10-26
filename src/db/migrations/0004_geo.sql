CREATE TABLE "geo_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"domain" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_competitors_status_valid" CHECK ("geo_competitors"."status" in ('active', 'archived')),
	CONSTRAINT "geo_competitors_name_not_blank" CHECK (length(btrim("geo_competitors"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "geo_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prompt_id" text NOT NULL,
	"repetition" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tag" text NOT NULL,
	"provider_task_id" text,
	"response_text" text,
	"answer_present" boolean,
	"sources" jsonb,
	"mentions" jsonb,
	"own_cited" boolean,
	"competitors_cited" jsonb,
	"cost_micro_usd" bigint,
	"error" text,
	"submitted_at" timestamp with time zone,
	"observed_at" timestamp with time zone,
	CONSTRAINT "geo_observations_status_valid" CHECK ("geo_observations"."status" in ('pending', 'submitted', 'completed', 'failed', 'uncertain')),
	CONSTRAINT "geo_observations_repetition_valid" CHECK ("geo_observations"."repetition" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "geo_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"text" text NOT NULL,
	"intent" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geo_prompts_intent_valid" CHECK ("geo_prompts"."intent" in ('discovery', 'recommendation', 'comparison', 'branded')),
	CONSTRAINT "geo_prompts_status_valid" CHECK ("geo_prompts"."status" in ('active', 'archived')),
	CONSTRAINT "geo_prompts_text_length" CHECK (length(btrim("geo_prompts"."text")) between 5 and 400)
);
--> statement-breakpoint
CREATE TABLE "geo_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"config" jsonb NOT NULL,
	"methodology_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "geo_runs_provider_valid" CHECK ("geo_runs"."provider" in ('manual', 'dataforseo_chatgpt')),
	CONSTRAINT "geo_runs_status_valid" CHECK ("geo_runs"."status" in ('collecting', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "provider_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"workspace_id" uuid,
	"run_id" uuid,
	"observation_id" uuid,
	"amount_micro_usd" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"price_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "provider_spend_amount_non_negative" CHECK ("provider_spend"."amount_micro_usd" >= 0),
	CONSTRAINT "provider_spend_currency_usd" CHECK ("provider_spend"."currency" = 'USD'),
	CONSTRAINT "provider_spend_status_valid" CHECK ("provider_spend"."status" in ('reserved', 'settled', 'released', 'uncertain'))
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_aliases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "geo_run_id" uuid;--> statement-breakpoint
ALTER TABLE "geo_competitors" ADD CONSTRAINT "geo_competitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observations" ADD CONSTRAINT "geo_observations_run_id_geo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_observations" ADD CONSTRAINT "geo_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_prompts" ADD CONSTRAINT "geo_prompts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geo_runs" ADD CONSTRAINT "geo_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_spend" ADD CONSTRAINT "provider_spend_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_spend" ADD CONSTRAINT "provider_spend_run_id_geo_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."geo_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_spend" ADD CONSTRAINT "provider_spend_observation_id_geo_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."geo_observations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geo_competitors_workspace_idx" ON "geo_competitors" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_observations_run_prompt_rep_key" ON "geo_observations" USING btree ("run_id","prompt_id","repetition");--> statement-breakpoint
CREATE UNIQUE INDEX "geo_observations_tag_key" ON "geo_observations" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "geo_observations_run_idx" ON "geo_observations" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "geo_prompts_workspace_idx" ON "geo_prompts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "geo_runs_workspace_created_idx" ON "geo_runs" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "provider_spend_created_idx" ON "provider_spend" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "provider_spend_observation_idx" ON "provider_spend" USING btree ("observation_id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_geo_run_id_geo_runs_id_fk" FOREIGN KEY ("geo_run_id") REFERENCES "public"."geo_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_brand_aliases_count" CHECK (cardinality("workspaces"."brand_aliases") <= 10);