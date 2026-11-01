CREATE TABLE "workspace_goals" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"event_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_goals_kind_valid" CHECK ("workspace_goals"."kind" in ('request', 'booking', 'purchase', 'other')),
	CONSTRAINT "workspace_goals_label_length" CHECK (length(btrim("workspace_goals"."label")) between 1 and 80),
	CONSTRAINT "workspace_goals_event_length" CHECK ("workspace_goals"."event_name" = btrim("workspace_goals"."event_name") and length("workspace_goals"."event_name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "workspace_goals" ADD CONSTRAINT "workspace_goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;