ALTER TABLE "search_console_snapshots" DROP CONSTRAINT "search_console_snapshots_error_kind_valid";--> statement-breakpoint
ALTER TABLE "search_console_snapshots" ADD CONSTRAINT "search_console_snapshots_error_kind_valid" CHECK ("search_console_snapshots"."error_kind" is null or "search_console_snapshots"."error_kind" in ('invalid_credentials', 'api_disabled', 'no_access', 'quota_exceeded', 'keyword_limit', 'error'));--> statement-breakpoint
-- Same rules. Silent jsonpath already makes it total, so an infrastructure error must not read as a malformed series.
CREATE OR REPLACE FUNCTION tracked_keyword_series_valid(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
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
END;
$$;
