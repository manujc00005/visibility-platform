CREATE TABLE "search_console_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider" text DEFAULT 'google_gsc' NOT NULL,
	"capture_condition" text DEFAULT 'owner_api' NOT NULL,
	"property" text,
	"current_start" date,
	"current_end" date,
	"previous_start" date,
	"previous_end" date,
	"totals" jsonb,
	"previous_totals" jsonb,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_kind" text,
	"error_message" text,
	"accessible_properties" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_console_snapshots_status_valid" CHECK ("search_console_snapshots"."status" in ('completed', 'failed')),
	CONSTRAINT "search_console_snapshots_error_kind_valid" CHECK ("search_console_snapshots"."error_kind" is null or "search_console_snapshots"."error_kind" in ('invalid_credentials', 'api_disabled', 'no_access', 'quota_exceeded', 'error')),
	CONSTRAINT "search_console_snapshots_completed_complete" CHECK ("search_console_snapshots"."status" <> 'completed' or ("search_console_snapshots"."property" is not null and "search_console_snapshots"."current_start" is not null and "search_console_snapshots"."current_end" is not null and "search_console_snapshots"."previous_start" is not null and "search_console_snapshots"."previous_end" is not null and "search_console_snapshots"."totals" is not null and "search_console_snapshots"."previous_totals" is not null and "search_console_snapshots"."error_kind" is null)),
	CONSTRAINT "search_console_snapshots_failed_has_reason" CHECK ("search_console_snapshots"."status" <> 'failed' or ("search_console_snapshots"."error_kind" is not null and "search_console_snapshots"."error_message" is not null)),
	CONSTRAINT "search_console_snapshots_rows_are_arrays" CHECK (jsonb_typeof("search_console_snapshots"."queries") = 'array' and jsonb_typeof("search_console_snapshots"."pages") = 'array')
);
--> statement-breakpoint
ALTER TABLE "search_console_snapshots" ADD CONSTRAINT "search_console_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_console_snapshots_workspace_created_idx" ON "search_console_snapshots" USING btree ("workspace_id","created_at" DESC NULLS LAST);