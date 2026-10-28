CREATE TABLE "bing_webmaster_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT 'bing_wmt' NOT NULL,
	"capture_condition" text DEFAULT 'owner_api' NOT NULL,
	"site_url" text,
	"current_start" date,
	"current_end" date,
	"previous_start" date,
	"previous_end" date,
	"totals" jsonb,
	"previous_totals" jsonb,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rows_start" date,
	"rows_end" date,
	"error_kind" text,
	"error_message" text,
	"verified_sites" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bing_webmaster_snapshots_status_valid" CHECK ("bing_webmaster_snapshots"."status" in ('completed', 'failed')),
	CONSTRAINT "bing_webmaster_snapshots_error_kind_valid" CHECK ("bing_webmaster_snapshots"."error_kind" is null or "bing_webmaster_snapshots"."error_kind" in ('invalid_credentials', 'quota_exceeded', 'no_access', 'not_verified', 'error')),
	CONSTRAINT "bing_webmaster_snapshots_completed_complete" CHECK ("bing_webmaster_snapshots"."status" <> 'completed' or ("bing_webmaster_snapshots"."site_url" is not null and "bing_webmaster_snapshots"."error_kind" is null and num_nulls("bing_webmaster_snapshots"."current_start", "bing_webmaster_snapshots"."current_end", "bing_webmaster_snapshots"."previous_start", "bing_webmaster_snapshots"."previous_end", "bing_webmaster_snapshots"."totals", "bing_webmaster_snapshots"."previous_totals") in (0, 6))),
	CONSTRAINT "bing_webmaster_snapshots_failed_has_reason" CHECK ("bing_webmaster_snapshots"."status" <> 'failed' or ("bing_webmaster_snapshots"."error_kind" is not null and "bing_webmaster_snapshots"."error_message" is not null)),
	CONSTRAINT "bing_webmaster_snapshots_rows_are_arrays" CHECK (jsonb_typeof("bing_webmaster_snapshots"."queries") = 'array' and jsonb_typeof("bing_webmaster_snapshots"."pages") = 'array'),
	CONSTRAINT "bing_webmaster_snapshots_rows_window" CHECK (num_nulls("bing_webmaster_snapshots"."rows_start", "bing_webmaster_snapshots"."rows_end") in (0, 2))
);
--> statement-breakpoint
ALTER TABLE "bing_webmaster_snapshots" ADD CONSTRAINT "bing_webmaster_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bing_webmaster_snapshots_workspace_created_idx" ON "bing_webmaster_snapshots" USING btree ("workspace_id","created_at" DESC NULLS LAST);