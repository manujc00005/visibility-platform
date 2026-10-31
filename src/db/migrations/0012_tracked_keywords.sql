-- Total validator: malformed JSON returns false, producing the named CHECK violation.
CREATE FUNCTION tracked_keyword_series_valid(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; week jsonb;
BEGIN
  IF jsonb_path_exists(value, 'strict $ ? (@.type() == "object" && @.version.type() == "number" && @.version == 1 && @.start.type() == "string" && @.end.type() == "string" && @.keywords.type() == "array" && @.keywords.size() <= 25)', '{}', true) IS NOT TRUE THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(value->'keywords') LOOP
    IF jsonb_path_exists(item, 'strict $ ? (@.type() == "object" && @.keyword.type() == "string" && @.weeks.type() == "array" && @.weeks.size() <= 26)', '{}', true) IS NOT TRUE THEN RETURN false; END IF;
    IF char_length(item->>'keyword') NOT BETWEEN 2 AND 80 THEN RETURN false; END IF;
    FOR week IN SELECT * FROM jsonb_array_elements(item->'weeks') LOOP
      IF jsonb_path_exists(week, 'strict $ ? (@.type() == "object" && @.start.type() == "string" && @.clicks.type() == "number" && @.clicks >= 0 && @.impressions.type() == "number" && @.impressions > 0 && @.position.type() == "number" && @.position > 0 && @.daysWithData.type() == "number" && @.daysWithData >= 1 && @.daysWithData <= 7 && @.daysWithData.floor() == @.daysWithData)', '{}', true) IS NOT TRUE THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
--> statement-breakpoint
CREATE TABLE "tracked_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_keywords_length" CHECK (char_length("tracked_keywords"."keyword") between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "search_console_snapshots" ADD COLUMN "keyword_series" jsonb;--> statement-breakpoint
ALTER TABLE "tracked_keywords" ADD CONSTRAINT "tracked_keywords_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_keywords_workspace_keyword_unique" ON "tracked_keywords" USING btree ("workspace_id","keyword");--> statement-breakpoint
ALTER TABLE "search_console_snapshots" ADD CONSTRAINT "search_console_snapshots_keyword_series_shape" CHECK ("search_console_snapshots"."keyword_series" is null or tracked_keyword_series_valid("search_console_snapshots"."keyword_series"));--> statement-breakpoint
ALTER TABLE "search_console_snapshots" ADD CONSTRAINT "search_console_snapshots_failed_without_keyword_series" CHECK ("search_console_snapshots"."status" <> 'failed' or "search_console_snapshots"."keyword_series" is null);