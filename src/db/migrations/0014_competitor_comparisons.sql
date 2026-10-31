CREATE TABLE "competitor_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"sites" jsonb,
	"rules_version" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "competitor_comparisons_status_valid" CHECK ("competitor_comparisons"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "competitor_comparisons_error_valid" CHECK ("competitor_comparisons"."error" is null or "competitor_comparisons"."error" in ('internal_error', 'interrupted')),
	CONSTRAINT "competitor_comparisons_sites_only_completed" CHECK (("competitor_comparisons"."status" = 'completed') = ("competitor_comparisons"."sites" is not null)),
	CONSTRAINT "competitor_comparisons_error_only_failed" CHECK (("competitor_comparisons"."status" = 'failed') = ("competitor_comparisons"."error" is not null)),
	CONSTRAINT "competitor_comparisons_finished_consistent" CHECK (("competitor_comparisons"."status" = 'running') = ("competitor_comparisons"."finished_at" is null) and ("competitor_comparisons"."finished_at" is null or "competitor_comparisons"."finished_at" >= "competitor_comparisons"."started_at")),
	CONSTRAINT "competitor_comparisons_sites_shape" CHECK ("competitor_comparisons"."sites" is null or jsonb_path_exists("competitor_comparisons"."sites", 'strict $ ? (@.type() == "object" && @.version.type() == "number" && @.version == 1 && @.sites.type() == "array" && @.sites.size() >= 1 && @.sites.size() <= 6)', '{}', true) is true)
);
--> statement-breakpoint
ALTER TABLE "competitor_comparisons" ADD CONSTRAINT "competitor_comparisons_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_comparisons_one_running_per_workspace" ON "competitor_comparisons" USING btree ("workspace_id") WHERE "competitor_comparisons"."status" = 'running';--> statement-breakpoint
CREATE INDEX "competitor_comparisons_workspace_started_idx" ON "competitor_comparisons" USING btree ("workspace_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);