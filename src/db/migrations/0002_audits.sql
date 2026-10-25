CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"recommendation" text NOT NULL,
	CONSTRAINT "audit_findings_severity_valid" CHECK ("audit_findings"."severity" in ('critical', 'warning', 'info'))
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"requested_url" text NOT NULL,
	"final_url" text,
	"rules_version" text NOT NULL,
	"facts" jsonb,
	"fetch_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"info_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "audits_status_valid" CHECK ("audits"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "audits_finished_consistent" CHECK (("audits"."status" = 'running') = ("audits"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_findings_audit_position_key" ON "audit_findings" USING btree ("audit_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "audits_one_running_per_workspace" ON "audits" USING btree ("workspace_id") WHERE "audits"."status" = 'running';--> statement-breakpoint
CREATE INDEX "audits_workspace_started_idx" ON "audits" USING btree ("workspace_id","started_at" DESC NULLS LAST);