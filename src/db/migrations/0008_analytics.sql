CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT 'ga4' NOT NULL,
	"capture_condition" text DEFAULT 'owner_api' NOT NULL,
	"property" text,
	"property_name" text,
	"current_start" date,
	"current_end" date,
	"previous_start" date,
	"previous_end" date,
	"totals" jsonb,
	"previous_totals" jsonb,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quality" jsonb,
	"error_kind" text,
	"error_message" text,
	"accessible_properties" integer,
	"properties_skipped" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_snapshots_status_valid" CHECK ("analytics_snapshots"."status" in ('completed', 'failed')),
	CONSTRAINT "analytics_snapshots_error_kind_valid" CHECK ("analytics_snapshots"."error_kind" is null or "analytics_snapshots"."error_kind" in ('invalid_credentials', 'admin_api_disabled', 'data_api_disabled', 'no_access', 'quota_exceeded', 'error')),
	CONSTRAINT "analytics_snapshots_completed_complete" CHECK ("analytics_snapshots"."status" <> 'completed' or ("analytics_snapshots"."property" is not null and "analytics_snapshots"."error_kind" is null and num_nulls("analytics_snapshots"."current_start", "analytics_snapshots"."current_end", "analytics_snapshots"."previous_start", "analytics_snapshots"."previous_end", "analytics_snapshots"."totals", "analytics_snapshots"."previous_totals", "analytics_snapshots"."quality") = 0)),
	CONSTRAINT "analytics_snapshots_failed_has_reason" CHECK ("analytics_snapshots"."status" <> 'failed' or ("analytics_snapshots"."error_kind" is not null and "analytics_snapshots"."error_message" is not null)),
	CONSTRAINT "analytics_snapshots_rows_are_arrays" CHECK (jsonb_typeof("analytics_snapshots"."channels") = 'array' and jsonb_typeof("analytics_snapshots"."pages") = 'array')
);
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_snapshots_workspace_created_idx" ON "analytics_snapshots" USING btree ("workspace_id","created_at" DESC NULLS LAST);